-- Static player pages are the only version of the site that answer engines and
-- other crawlers without JavaScript ever read, so the SEO manifest now carries
-- the citable record snapshot as well as the identity fields. Every added
-- payload stays bounded: at most five award rows and one entry per public
-- source, keeping the deployment-time fetch predictable.

create or replace view public.public_player_seo_manifest with (security_invoker = true) as
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
  count(distinct r.source_id)::integer source_count,
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
left join public.clubs c on c.id = p.primary_club_id
where p.merged_into_player_id is null
group by p.id, c.canonical_name;

grant select on public.public_player_seo_manifest to anon;

comment on view public.public_player_seo_manifest is
  'Bounded public player metadata and a capped record snapshot used only for deployment-time SEO snapshots.';

notify pgrst, 'reload schema';
