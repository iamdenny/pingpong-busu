-- Precompute the player record snapshot outside the deployment's critical path.
--
-- History: 202608200001 put the record expressions in the enumerated view and
-- the anon statement timeout cancelled every wide read (57014). Building the
-- same expressions as a materialized view then moved the cost into `supabase db
-- push`, where the migration connection's own statement timeout cancelled the
-- initial populate. So the deployment must not depend on how long the snapshot
-- takes to compute at all.
--
-- The snapshot is therefore an ordinary table created empty. An empty table is
-- queryable (an unpopulated materialized view is not), so the public view keeps
-- answering from the moment this migration lands and simply reports no records
-- until the first refresh. The refresh runs on its own schedule, raises its own
-- statement timeout, and computes into a staging table so the swap holds its
-- lock for a single insert rather than for the whole computation.
--
-- The snapshot is written by a security definer function, so its query
-- reproduces the anon policies exactly: identities `match_status <> 'disputed'`,
-- results `record_status <> 'disputed'`, and merged players excluded. It must
-- never hold a row anon could not already read through the base tables, and it
-- is keyed by the public id so no internal identifier reaches this schema.

drop materialized view if exists public.player_seo_record_snapshot;

create table if not exists public.player_seo_record_snapshot (
  id text primary key,
  recent_observed_division text,
  recent_observed_division_system text,
  recent_awards jsonb not null default '[]'::jsonb,
  source_names text[] not null default '{}'::text[],
  last_checked_at timestamptz,
  refreshed_at timestamptz not null default now()
);

alter table public.player_seo_record_snapshot enable row level security;

drop policy if exists "public reads seo record snapshot" on public.player_seo_record_snapshot;
create policy "public reads seo record snapshot"
  on public.player_seo_record_snapshot
  for select to anon using (true);

grant select on public.player_seo_record_snapshot to anon;

create or replace function public.refresh_player_seo_record_snapshot()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  written integer;
begin
  -- The computation is the slow part and it runs before the swap, so the write
  -- lock below is held only for one delete and one insert of ~13k rows.
  set local statement_timeout = '20min';
  create temporary table player_seo_record_staging on commit drop as
select
  p.public_id::text id,
  (array_agg(
    btrim(r.division_value)
    order by coalesce(t.held_on, r.source_published_on) desc nulls last,
      case when effective.division_system in ('integrated', 'women') then 0 else 1 end,
      r.last_checked_at desc,
      r.id desc
  ) filter (
    where nullif(btrim(r.division_value), '') is not null
      and (t.held_on is null or t.held_on <= current_date)
      and not public.is_historical_division_record(
        effective.division_system,
        t.held_on,
        public.infer_division_tournament_region(
          r.tournament_name_text,
          r.event_name
        ),
        r.tournament_name_text
      )
  ))[1] recent_observed_division,
  (array_agg(
    effective.division_system
    order by coalesce(t.held_on, r.source_published_on) desc nulls last,
      case when effective.division_system in ('integrated', 'women') then 0 else 1 end,
      r.last_checked_at desc,
      r.id desc
  ) filter (
    where nullif(btrim(r.division_value), '') is not null
      and (t.held_on is null or t.held_on <= current_date)
      and not public.is_historical_division_record(
        effective.division_system,
        t.held_on,
        public.infer_division_tournament_region(
          r.tournament_name_text,
          r.event_name
        ),
        r.tournament_name_text
      )
  ))[1] recent_observed_division_system,
  coalesce((
    select jsonb_agg(
      recent.entry
      order by recent.held_on desc nulls last, recent.checked_at desc, recent.result_id desc
    )
    from (
      select jsonb_build_object(
        'rank', r2.rank_text,
        'date', coalesce(t2.held_on, r2.source_published_on),
        'tournament', r2.tournament_name_text,
        'event', r2.event_name,
        'division', nullif(btrim(r2.division_value), ''),
        'division_system', effective2.division_system
      ) entry,
      coalesce(t2.held_on, r2.source_published_on) held_on,
      r2.last_checked_at checked_at,
      r2.id result_id
      from public.source_player_identities spi2
      join public.results r2
        on r2.source_player_identity_id = spi2.id
        and r2.record_status <> 'disputed'
      left join public.tournaments t2 on t2.id = r2.tournament_id
      cross join lateral (
        select public.effective_division_system(
          r2.division_system,
          r2.tournament_name_text,
          r2.event_name,
          r2.division_value,
          t2.held_on,
          public.infer_division_tournament_region(r2.tournament_name_text, r2.event_name)
        ) division_system
      ) effective2
      where spi2.player_id = p.id
        and spi2.match_status <> 'disputed'
        and public.is_award_rank(r2.rank_text)
        and (t2.held_on is null or t2.held_on <= current_date)
        and not public.is_historical_division_record(
          effective2.division_system,
          t2.held_on,
          public.infer_division_tournament_region(
            r2.tournament_name_text,
            r2.event_name
          ),
          r2.tournament_name_text
        )
      order by held_on desc nulls last, checked_at desc, result_id desc
      limit 5
    ) recent
  ), '[]'::jsonb) recent_awards,
  coalesce(
    array_agg(distinct s.display_name) filter (
      where s.code not in ('mock', 'band')
        and nullif(btrim(s.display_name), '') is not null
    ),
    '{}'::text[]
  ) source_names,
  coalesce(max(r.last_checked_at), p.updated_at) last_checked_at
from public.players p
join public.source_player_identities spi
  on spi.player_id = p.id
  and spi.match_status <> 'disputed'
join public.sources s on s.id = spi.source_id
join public.results r
  on r.source_player_identity_id = spi.id
  and r.record_status <> 'disputed'
left join public.tournaments t on t.id = r.tournament_id
cross join lateral (
  select public.effective_division_system(
    r.division_system,
    r.tournament_name_text,
    r.event_name,
    r.division_value,
    t.held_on,
    public.infer_division_tournament_region(r.tournament_name_text, r.event_name)
  ) division_system
) effective
where p.merged_into_player_id is null
group by p.id;
  delete from public.player_seo_record_snapshot;
  insert into public.player_seo_record_snapshot(
    id,
    recent_observed_division,
    recent_observed_division_system,
    recent_awards,
    source_names,
    last_checked_at,
    refreshed_at
  )
  select
    staging.id,
    staging.recent_observed_division,
    staging.recent_observed_division_system,
    staging.recent_awards,
    staging.source_names,
    staging.last_checked_at,
    now()
  from player_seo_record_staging staging;
  get diagnostics written = row_count;
  return written;
end;
$$;

revoke all on function public.refresh_player_seo_record_snapshot() from public, anon, authenticated;
grant execute on function public.refresh_player_seo_record_snapshot() to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'refresh-player-seo-record-snapshot',
  '41 2 * * *',
  $$select public.refresh_player_seo_record_snapshot();$$
);

drop view if exists public.public_player_seo_manifest;

create view public.public_player_seo_manifest with (security_invoker = true) as
select
  base.id,
  base.canonical_name,
  base.homonym_nickname,
  base.primary_region,
  base.primary_club,
  base.result_count,
  base.source_count,
  snapshot.recent_observed_division,
  snapshot.recent_observed_division_system,
  coalesce(snapshot.recent_awards, '[]'::jsonb) recent_awards,
  coalesce(snapshot.source_names, '{}'::text[]) source_names,
  snapshot.last_checked_at
from (
select
  p.public_id::text id,
  p.canonical_name,
  p.homonym_nickname,
  (array_agg(
    nullif(btrim(spi.source_region), '')
    order by spi.last_checked_at desc, spi.id desc
  ) filter (
    where s.code <> 'iping'
      and nullif(btrim(spi.source_region), '') is not null
  ))[1] primary_region,
  coalesce(
    c.canonical_name,
    (array_agg(
      nullif(btrim(spi.source_club_text), '')
      order by spi.last_checked_at desc, spi.id desc
    ) filter (where nullif(btrim(spi.source_club_text), '') is not null))[1]
  ) primary_club,
  count(distinct r.id) filter (where public.is_award_rank(r.rank_text))::integer result_count,
  count(distinct r.source_id)::integer source_count
from public.players p
join public.source_player_identities spi
  on spi.player_id = p.id
  and spi.match_status <> 'disputed'
join public.sources s on s.id = spi.source_id
join public.results r
  on r.source_player_identity_id = spi.id
  and r.record_status <> 'disputed'
left join public.clubs c on c.id = p.primary_club_id
where p.merged_into_player_id is null
group by p.id, c.canonical_name
) base
left join public.player_seo_record_snapshot snapshot
  on snapshot.id = base.id;

grant select on public.public_player_seo_manifest to anon;

comment on table public.player_seo_record_snapshot is
  'Precomputed record snapshot for static player pages. Written only by refresh_player_seo_record_snapshot, which reproduces the anon row-level predicates.';

comment on function public.refresh_player_seo_record_snapshot() is
  'Recomputes the static player page record snapshot. Service role only; scheduled nightly.';

comment on view public.public_player_seo_manifest is
  'Bounded public player metadata joined to the precomputed record snapshot, used only for deployment-time SEO snapshots.';

notify pgrst, 'reload schema';
