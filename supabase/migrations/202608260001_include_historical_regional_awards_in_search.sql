create or replace view public.public_player_search with (security_invoker = true) as
select
  p.public_id::text id,
  p.canonical_name,
  p.normalized_name,
  coalesce(
    (array_agg(
      nullif(btrim(case when r.source_code = 'iping' then null else r.representative_source_region end), '')
      order by r.sort_date desc nulls last, r.last_checked_at desc, r.id desc
    ) filter (
      where nullif(btrim(case when r.source_code = 'iping' then null else r.representative_source_region end), '') is not null
    ))[1],
    (
      select nullif(btrim(trusted_identity.source_region), '')
      from public.source_player_identities trusted_identity
      join public.sources trusted_source on trusted_source.id = trusted_identity.source_id
      where trusted_identity.player_id = p.id
        and trusted_identity.match_status <> 'disputed'
        and trusted_source.code <> 'iping'
        and nullif(btrim(trusted_identity.source_region), '') is not null
      order by trusted_identity.last_checked_at desc, trusted_identity.id desc
      limit 1
    )
  ) primary_region,
  coalesce(
    (array_agg(
      nullif(btrim(r.club_text), '')
      order by r.sort_date desc nulls last, r.last_checked_at desc, r.id desc
    ) filter (where nullif(btrim(r.club_text), '') is not null))[1],
    (
      select nullif(btrim(trusted_identity.source_club_text), '')
      from public.source_player_identities trusted_identity
      where trusted_identity.player_id = p.id
        and trusted_identity.match_status <> 'disputed'
        and nullif(btrim(trusted_identity.source_club_text), '') is not null
      order by trusted_identity.last_checked_at desc, trusted_identity.id desc
      limit 1
    ),
    c.canonical_name
  ) primary_club,
  (array_agg(
    r.division_value
    order by r.sort_date desc nulls last,
      case when r.effective_division_system in ('integrated', 'women') then 0 else 1 end,
      r.last_checked_at desc,
      r.id desc
  ) filter (
    where nullif(btrim(r.division_value), '') is not null
      and public.is_individual_division_record(r.event_type, r.event_name)
      and (r.tournament_date is null or r.tournament_date <= current_date)
      and not public.is_historical_division_record(
        r.effective_division_system,
        r.tournament_date,
        r.tournament_region,
        r.tournament_name_text
      )
  ))[1] recent_observed_division,
  count(*) filter (
    where public.is_award_rank(r.rank_text)
      and (r.tournament_date is null or r.tournament_date <= current_date)
  )::integer result_count,
  coalesce((
    select count(distinct source_item->>'source_code')::integer
    from public.public_result_groups source_group
    cross join lateral jsonb_array_elements(source_group.sources) source_item
    where source_group.player_public_id = p.public_id
  ), 0) source_count,
  coalesce(max(r.last_checked_at), p.updated_at) last_checked_at,
  p.identity_status,
  (array_agg(
    r.effective_division_system
    order by r.sort_date desc nulls last,
      case when r.effective_division_system in ('integrated', 'women') then 0 else 1 end,
      r.last_checked_at desc,
      r.id desc
  ) filter (
    where nullif(btrim(r.division_value), '') is not null
      and public.is_individual_division_record(r.event_type, r.event_name)
      and (r.tournament_date is null or r.tournament_date <= current_date)
      and not public.is_historical_division_record(
        r.effective_division_system,
        r.tournament_date,
        r.tournament_region,
        r.tournament_name_text
      )
  ))[1] recent_observed_division_system,
  coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', r.rank_text,
      'date', r.sort_date,
      'tournament', r.tournament_name_text,
      'event', r.event_name,
      'last_checked_at', r.last_checked_at,
      'source_count', r.grouped_result_count
    )
    order by r.sort_date desc nulls last, r.last_checked_at desc, r.id desc
  ) filter (
    where public.is_award_rank(r.rank_text)
      and (r.tournament_date is null or r.tournament_date <= current_date)
  ), '[]'::jsonb) award_results,
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
      select coalesce(r2.effective_division_system, 'unknown') system,
        btrim(r2.division_value) division,
        count(*) filter (where public.is_award_rank(r2.rank_text))::integer award_count,
        count(*) filter (where not public.is_award_rank(r2.rank_text))::integer participation_count
      from public.public_result_groups r2
      where r2.player_public_id = p.public_id
        and nullif(btrim(r2.division_value), '') is not null
        and public.is_individual_division_record(r2.event_type, r2.event_name)
        and (r2.tournament_date is null or r2.tournament_date <= current_date)
        and not public.is_historical_division_record(
          r2.effective_division_system,
          r2.tournament_date,
          r2.tournament_region,
          r2.tournament_name_text
        )
      group by coalesce(r2.effective_division_system, 'unknown'), btrim(r2.division_value)
    ) observation
  ), '[]'::jsonb) division_observations,
  p.homonym_nickname,
  max(r.sort_date) filter (
    where not public.is_award_rank(r.rank_text)
      and (r.tournament_date is null or r.tournament_date <= current_date)
      and not public.is_historical_division_record(
        r.effective_division_system,
        r.tournament_date,
        r.tournament_region,
        r.tournament_name_text
      )
  ) latest_participation_date,
  (array_agg(r.tournament_name_text order by r.sort_date desc nulls last, r.last_checked_at desc, r.id desc)
    filter (
      where not public.is_award_rank(r.rank_text)
        and (r.tournament_date is null or r.tournament_date <= current_date)
        and not public.is_historical_division_record(
          r.effective_division_system,
          r.tournament_date,
          r.tournament_region,
          r.tournament_name_text
        )
        and nullif(btrim(r.tournament_name_text), '') is not null
    ))[1] latest_participation_tournament,
  (array_agg(r.last_checked_at order by r.sort_date desc nulls last, r.last_checked_at desc, r.id desc)
    filter (
      where not public.is_award_rank(r.rank_text)
        and (r.tournament_date is null or r.tournament_date <= current_date)
        and not public.is_historical_division_record(
          r.effective_division_system,
          r.tournament_date,
          r.tournament_region,
          r.tournament_name_text
        )
    ))[1] latest_participation_checked_at,
  (array_agg(r.event_name order by r.sort_date desc nulls last, r.last_checked_at desc, r.id desc)
    filter (
      where not public.is_award_rank(r.rank_text)
        and (r.tournament_date is null or r.tournament_date <= current_date)
        and not public.is_historical_division_record(
          r.effective_division_system,
          r.tournament_date,
          r.tournament_region,
          r.tournament_name_text
        )
        and nullif(btrim(r.event_name), '') is not null
    ))[1] latest_participation_event
from public.players p
left join public.clubs c on c.id = p.primary_club_id
left join public.public_result_groups r on r.player_public_id = p.public_id
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
  'Public player summaries whose award and division counts consistently use grouped cross-source display results.';

grant select on public.public_player_search to anon;

notify pgrst, 'reload schema';
