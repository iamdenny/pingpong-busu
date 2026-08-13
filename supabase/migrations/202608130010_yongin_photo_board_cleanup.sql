-- Kakao cafe search snippets flatten several awardees into one text fragment.
-- The IWou board contains awardee photos, not player-scoped result rows, so
-- records inferred from it cannot safely associate a division or rank.
update public.results result
set record_status = 'disputed',
    updated_at = now()
from public.sources source
where source.id = result.source_id
  and source.code = 'yongintt'
  and result.record_status <> 'disputed'
  and (
    lower(result.source_url) like 'https://cafe.daum.net/yongintt/iwou/%'
    or lower(result.source_url) like 'https://m.cafe.daum.net/yongintt/iwou/%'
    or result.tournament_name_text ~ '입상자[[:space:]]*사진|수상자[[:space:]]*사진'
  );

-- A Yongin source identity is scoped to one post URL. Hide identities that no
-- longer have any trustworthy result while retaining the audit trail.
update public.source_player_identities identity
set match_status = 'disputed',
    updated_at = now()
from public.sources source
where source.id = identity.source_id
  and source.code = 'yongintt'
  and identity.match_status <> 'disputed'
  and not exists (
    select 1
    from public.results result
    where result.source_player_identity_id = identity.id
      and result.record_status <> 'disputed'
  );

-- Public search should not expose a player candidate whose every source result
-- is disputed. The player and source identity remain available to the audit
-- and rollback paths.
create or replace view public.public_player_search with (security_invoker = true) as
select p.public_id::text id,
  p.canonical_name,
  p.normalized_name,
  p.primary_region,
  c.canonical_name primary_club,
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
      jsonb_build_object('rank', r.rank_text, 'date', coalesce(t.held_on, r.source_published_on))
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
  p.homonym_nickname
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

update public.sources
set parser_version = 'yongintt-3',
    updated_at = now()
where code = 'yongintt';
