create or replace view public.public_player_search with (security_invoker = true) as
select p.public_id::text id,
  p.canonical_name,
  p.normalized_name,
  coalesce(
    (array_agg(
      nullif(btrim(t.region), '')
      order by coalesce(t.held_on, r.source_published_on) desc nulls last,
        r.last_checked_at desc,
        r.id desc
    ) filter (where nullif(btrim(t.region), '') is not null))[1],
    (array_agg(
      nullif(btrim(spi.source_region), '')
      order by spi.last_checked_at desc, spi.id desc
    ) filter (
      where r.id is not null
        and nullif(btrim(spi.source_region), '') is not null
    ))[1],
    p.primary_region
  ) primary_region,
  coalesce(
    (array_agg(
      nullif(btrim(r.club_text), '')
      order by coalesce(t.held_on, r.source_published_on) desc nulls last,
        r.last_checked_at desc,
        r.id desc
    ) filter (where nullif(btrim(r.club_text), '') is not null))[1],
    (array_agg(
      nullif(btrim(spi.source_club_text), '')
      order by spi.last_checked_at desc, spi.id desc
    ) filter (
      where r.id is not null
        and nullif(btrim(spi.source_club_text), '') is not null
    ))[1],
    c.canonical_name
  ) primary_club,
  (array_agg(r.division_value order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc)
    filter (where r.division_value is not null))[1] recent_observed_division,
  count(distinct r.id) filter (where public.is_award_rank(r.rank_text))::integer result_count,
  count(distinct r.source_id)::integer source_count,
  coalesce(max(r.last_checked_at), p.updated_at) last_checked_at,
  p.identity_status,
  (array_agg(r.division_system order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc)
    filter (where r.division_value is not null))[1] recent_observed_division_system,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rank_text,
        'date', coalesce(t.held_on, r.source_published_on),
        'tournament', r.tournament_name_text,
        'last_checked_at', r.last_checked_at
      )
      order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc
    ) filter (where public.is_award_rank(r.rank_text)),
    '[]'::jsonb
  ) award_results,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'system', observation.system,
        'division', observation.division,
        'award_count', observation.award_count,
        'participation_count', observation.participation_count
      ) order by observation.system, observation.division
    )
    from (
      select coalesce(r2.division_system, 'unknown') system,
        btrim(r2.division_value) division,
        count(distinct r2.id) filter (where public.is_award_rank(r2.rank_text))::integer award_count,
        count(distinct r2.id) filter (where not public.is_award_rank(r2.rank_text))::integer participation_count
      from public.source_player_identities spi2
      join public.results r2 on r2.source_player_identity_id = spi2.id
      where spi2.player_id = p.id
        and r2.record_status <> 'disputed'
        and nullif(btrim(r2.division_value), '') is not null
      group by coalesce(r2.division_system, 'unknown'), btrim(r2.division_value)
    ) observation
  ), '[]'::jsonb) division_observations,
  p.homonym_nickname,
  max(coalesce(t.held_on, r.source_published_on))
    filter (where not public.is_award_rank(r.rank_text)) latest_participation_date,
  (array_agg(
    r.tournament_name_text
    order by coalesce(t.held_on, r.source_published_on) desc nulls last,
      r.last_checked_at desc,
      r.id desc
  ) filter (
    where not public.is_award_rank(r.rank_text)
      and nullif(btrim(r.tournament_name_text), '') is not null
  ))[1] latest_participation_tournament,
  (array_agg(
    r.last_checked_at
    order by coalesce(t.held_on, r.source_published_on) desc nulls last,
      r.last_checked_at desc,
      r.id desc
  ) filter (where not public.is_award_rank(r.rank_text)))[1]
    latest_participation_checked_at
from public.players p
left join public.clubs c on c.id = p.primary_club_id
left join public.source_player_identities spi on spi.player_id = p.id
left join public.results r
  on r.source_player_identity_id = spi.id
  and r.record_status <> 'disputed'
left join public.tournaments t on t.id = r.tournament_id
where p.merged_into_player_id is null
  and exists (
    select 1
    from public.source_player_identities trusted_identity
    join public.results trusted_result
      on trusted_result.source_player_identity_id = trusted_identity.id
    where trusted_identity.player_id = p.id
      and trusted_identity.match_status <> 'disputed'
      and trusted_result.record_status <> 'disputed'
  )
group by p.id, c.canonical_name;

comment on view public.public_player_search is
  'Public player search summaries with latest observed region and club, identity status, award and participation dates, division counts, and optional homonym nickname.';

notify pgrst, 'reload schema';
