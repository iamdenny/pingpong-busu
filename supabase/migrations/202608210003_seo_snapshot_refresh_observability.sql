-- Make the snapshot refresh affordable, and make its outcome observable.
--
-- The 02:41 run after 202608210001 left the snapshot empty and there was no way
-- to tell whether pg_cron had not fired or the work had been cancelled. Two
-- changes address that.
--
-- 1. Cost. effective_division_system is plpgsql and was evaluated once per
--    result for the division aggregate and again per result inside a per-player
--    correlated subquery. Evaluating it once into a staging table and replacing
--    the correlated subquery with a window function cut a production-shaped
--    dataset (13,150 players / 142,020 results) from 5m32s to 58s locally, with
--    byte-identical output for all 13,150 rows.
--
-- 2. Observability. Every run records a row, including a cancelled one: the
--    exception block rolls back to its savepoint, so the failure row survives
--    and commits. An empty run log now means pg_cron never fired, which is a
--    different problem from a run that could not finish.

create table if not exists public.player_seo_snapshot_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_written integer,
  failed_reason text
);

alter table public.player_seo_snapshot_runs enable row level security;

drop policy if exists "public reads seo snapshot runs" on public.player_seo_snapshot_runs;
create policy "public reads seo snapshot runs"
  on public.player_seo_snapshot_runs
  for select to anon using (true);

grant select on public.player_seo_snapshot_runs to anon;

create or replace function public.refresh_player_seo_record_snapshot()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  written integer;
  started timestamptz := clock_timestamp();
begin
  begin
  set local statement_timeout = '55min';
  -- effective_division_system is plpgsql and dominates the cost, so it is
  -- evaluated once per result here and reused by every aggregate below.
  create temporary table seo_scoped on commit drop as
  select
    p.id player_id,
    p.public_id::text id,
    r.id result_id,
    r.rank_text,
    coalesce(t.held_on, r.source_published_on) held_on,
    r.tournament_name_text,
    r.event_name,
    nullif(btrim(r.division_value), '') division_value,
    r.last_checked_at,
    s.code source_code,
    s.display_name source_name,
    effective.division_system
  from public.players p
  join public.source_player_identities spi
    on spi.player_id = p.id and spi.match_status <> 'disputed'
  join public.sources s on s.id = spi.source_id
  join public.results r
    on r.source_player_identity_id = spi.id and r.record_status <> 'disputed'
  left join public.tournaments t on t.id = r.tournament_id
  cross join lateral (
    select public.effective_division_system(
      r.division_system, r.tournament_name_text, r.event_name,
      r.division_value, t.held_on,
      public.infer_division_tournament_region(r.tournament_name_text, r.event_name)
    ) division_system
  ) effective
  where p.merged_into_player_id is null;

  create temporary table seo_current on commit drop as
  select * from seo_scoped
  where (held_on is null or held_on <= current_date)
    and not public.is_historical_division_record(
      division_system, held_on,
      public.infer_division_tournament_region(tournament_name_text, event_name),
      tournament_name_text
    );

  create temporary table seo_awards on commit drop as
  select id, rank_text, held_on, tournament_name_text, event_name, division_value, division_system,
    row_number() over (
      partition by player_id
      order by held_on desc nulls last, last_checked_at desc, result_id desc
    ) position
  from seo_current
  where public.is_award_rank(rank_text);

  create temporary table seo_divisions on commit drop as
  select distinct on (player_id) player_id, id, division_value, division_system
  from seo_current
  where division_value is not null
  order by player_id,
    held_on desc nulls last,
    case when division_system in ('integrated','women') then 0 else 1 end,
    last_checked_at desc,
    result_id desc;

  delete from public.player_seo_record_snapshot;
  insert into public.player_seo_record_snapshot(
    id, recent_observed_division, recent_observed_division_system,
    recent_awards, source_names, last_checked_at, refreshed_at)
  select
    base.id,
    divisions.division_value,
    divisions.division_system,
    coalesce(awards.entries, '[]'::jsonb),
    base.source_names,
    base.last_checked_at,
    now()
  from (
    select
      scoped.id,
      coalesce(array_agg(distinct scoped.source_name) filter (
        where scoped.source_code not in ('mock','band')
          and nullif(btrim(scoped.source_name), '') is not null
      ), '{}'::text[]) source_names,
      max(scoped.last_checked_at) last_checked_at
    from seo_scoped scoped
    group by scoped.id
  ) base
  left join seo_divisions divisions on divisions.id = base.id
  left join (
    select id, jsonb_agg(
      jsonb_build_object(
        'rank', rank_text,
        'date', held_on,
        'tournament', tournament_name_text,
        'event', event_name,
        'division', division_value,
        'division_system', division_system
      ) order by position
    ) entries
    from seo_awards where position <= 5 group by id
  ) awards on awards.id = base.id;
  get diagnostics written = row_count;
  return written;
    insert into public.player_seo_snapshot_runs(started_at, finished_at, rows_written)
    values (started, clock_timestamp(), written);
    delete from public.player_seo_snapshot_runs
    where id not in (
      select id from public.player_seo_snapshot_runs order by started_at desc limit 30
    );
    return written;
  exception when others then
    -- The handler's savepoint keeps this row after the work above rolls back.
    insert into public.player_seo_snapshot_runs(started_at, finished_at, failed_reason)
    values (started, clock_timestamp(), left(sqlerrm, 300));
    return -1;
  end;
end;
$$;

revoke all on function public.refresh_player_seo_record_snapshot() from public, anon, authenticated;
grant execute on function public.refresh_player_seo_record_snapshot() to service_role;

comment on table public.player_seo_snapshot_runs is
  'Outcome of each static player page snapshot refresh, including cancelled runs. Read-only for anon so deployment problems are diagnosable without database access.';

notify pgrst, 'reload schema';
