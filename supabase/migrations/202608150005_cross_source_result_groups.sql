create or replace function public.normalize_result_display_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select regexp_replace(
    lower(normalize(coalesce(p_value, ''), NFKC)),
    '[[:space:]\[\](){}<>/\~·,._&+:-]+',
    '',
    'g'
  );
$$;

create or replace function public.result_display_fingerprint(
  p_player_public_id uuid,
  p_tournament_date date,
  p_tournament_name text,
  p_rank_text text,
  p_event_type text,
  p_event_name text,
  p_division_system text,
  p_division_value text,
  p_club_text text,
  p_partner_text text
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select case
    when p_player_public_id is null
      or p_tournament_date is null
      or nullif(public.normalize_result_display_text(p_tournament_name), '') is null
      or nullif(public.normalize_result_display_text(p_rank_text), '') is null
      or nullif(public.normalize_result_display_text(p_division_value), '') is null
    then null
    else md5(concat_ws(
      E'\x1f',
      p_player_public_id::text,
      p_tournament_date::text,
      public.normalize_result_display_text(p_tournament_name),
      public.normalize_result_display_text(
        case
          when coalesce(substring(
            normalize(coalesce(p_event_name, ''), NFKC)
            from '^([[:space:]]*\[[^]]+\][[:space:]]*)+'
          ), '') ~ '(남|여|혼)'
            and regexp_replace(
              normalize(coalesce(p_event_name, ''), NFKC),
              '^([[:space:]]*\[[^]]+\][[:space:]]*)+',
              '',
              'g'
            ) !~ '(남자|여자|여성|혼성|혼합)'
          then normalize(coalesce(p_event_name, ''), NFKC)
          else regexp_replace(
            normalize(coalesce(p_event_name, ''), NFKC),
            '^([[:space:]]*\[[^]]+\][[:space:]]*)+',
            '',
            'g'
          )
        end
      ),
      coalesce(nullif(lower(p_event_type), ''), 'unknown'),
      coalesce(nullif(lower(p_division_system), ''), 'unknown'),
      public.normalize_result_display_text(p_division_value),
      case
        when public.normalize_result_display_text(p_rank_text) = '우승' then '1위'
        when public.normalize_result_display_text(p_rank_text) = '준우승' then '2위'
        else public.normalize_result_display_text(p_rank_text)
      end,
      public.normalize_result_display_text(p_partner_text)
    ))
  end;
$$;

revoke all on function public.normalize_result_display_text(text) from public;
revoke all on function public.result_display_fingerprint(uuid, date, text, text, text, text, text, text, text, text) from public;
grant execute on function public.normalize_result_display_text(text) to anon, authenticated, service_role;
grant execute on function public.result_display_fingerprint(uuid, date, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;

create or replace view public.public_result_groups with (security_invoker = true) as
with result_evidence as (
  select
    r.*,
    s.code source_code,
    s.display_name source_name,
    spi.source_region representative_source_region,
    p.public_id player_public_id,
    coalesce(t.scale, 'unknown'::public.tournament_scale) tournament_scale,
    t.held_on tournament_date,
    r.source_published_on source_published_date,
    coalesce(t.held_on, r.source_published_on) sort_date,
    public.infer_division_tournament_region(
      r.tournament_name_text,
      r.event_name
    ) tournament_region,
    public.effective_division_system(
      r.division_system,
      r.tournament_name_text,
      r.event_name,
      r.division_value,
      t.held_on,
      public.infer_division_tournament_region(r.tournament_name_text, r.event_name)
    ) effective_division_system
  from public.results r
  join public.sources s on s.id = r.source_id
  join public.source_player_identities spi
    on spi.id = r.source_player_identity_id
    and spi.match_status <> 'disputed'
  join public.players p on p.id = spi.player_id
  left join public.tournaments t on t.id = r.tournament_id
  where r.record_status <> 'disputed'
), fingerprinted as (
  select evidence.*,
    public.result_display_fingerprint(
      evidence.player_public_id,
      evidence.tournament_date,
      evidence.tournament_name_text,
      evidence.rank_text,
      evidence.event_type::text,
      evidence.event_name,
      evidence.effective_division_system,
      evidence.division_value,
      evidence.club_text,
      evidence.partner_text
    ) candidate_fingerprint
  from result_evidence evidence
), collision_checked as (
  select fingerprinted.*,
    count(*) over (
      partition by fingerprinted.candidate_fingerprint, fingerprinted.source_id
    ) same_source_count
  from fingerprinted
), groupable as (
  select collision_checked.*,
    max(collision_checked.same_source_count) over (
      partition by collision_checked.candidate_fingerprint
    ) fingerprint_source_collision
  from collision_checked
), keyed as (
  select groupable.*,
    case
      when groupable.candidate_fingerprint is not null
        and groupable.fingerprint_source_collision = 1
      then groupable.candidate_fingerprint
      else 'result:' || groupable.id::text
    end result_fingerprint
  from groupable
), ranked as (
  select keyed.*,
    row_number() over (
      partition by keyed.result_fingerprint
      order by keyed.last_checked_at desc, keyed.id desc
    ) representative_rank
  from keyed
), grouped_sources as (
  select keyed.result_fingerprint,
    count(*)::integer grouped_result_count,
    jsonb_agg(
      jsonb_build_object(
        'original_record_id', keyed.id,
        'source_code', keyed.source_code,
        'source_name', keyed.source_name,
        'source_url', keyed.source_url,
        'event', keyed.event_name,
        'club_text', keyed.club_text,
        'division_system', keyed.division_system,
        'effective_division_system', keyed.effective_division_system,
        'division_value', keyed.division_value,
        'rank_text', keyed.rank_text,
        'partner_text', keyed.partner_text,
        'last_checked_at', keyed.last_checked_at
      )
      order by keyed.last_checked_at desc, keyed.source_code, keyed.id desc
    ) sources
  from keyed
  group by keyed.result_fingerprint
)
select
  representative.id,
  representative.source_id,
  representative.source_player_identity_id,
  representative.tournament_id,
  representative.tournament_name_text,
  representative.event_name,
  representative.event_type,
  representative.division_system,
  representative.division_value,
  representative.rank_text,
  representative.club_text,
  representative.partner_text,
  representative.source_url,
  representative.natural_key_hash,
  representative.content_hash,
  representative.first_seen_at,
  representative.last_seen_at,
  representative.last_checked_at,
  representative.record_status,
  representative.created_at,
  representative.updated_at,
  representative.source_published_on,
  representative.source_code,
  representative.source_name,
  representative.player_public_id,
  representative.tournament_scale,
  representative.tournament_date,
  representative.source_published_date,
  representative.sort_date,
  representative.tournament_region,
  representative.effective_division_system,
  representative.representative_source_region,
  representative.result_fingerprint,
  grouped.sources,
  grouped.grouped_result_count
from ranked representative
join grouped_sources grouped using (result_fingerprint)
where representative.representative_rank = 1;

create or replace view public.public_results with (security_invoker = true) as
select * from public.public_result_groups;

grant select on public.public_result_groups, public.public_results to anon;

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
      and not public.is_historical_division_record(
        r.effective_division_system,
        r.tournament_date,
        r.tournament_region,
        r.tournament_name_text
      )
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
      and not public.is_historical_division_record(
        r.effective_division_system,
        r.tournament_date,
        r.tournament_region,
        r.tournament_name_text
      )
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

comment on function public.result_display_fingerprint(uuid, date, text, text, text, text, text, text, text, text) is
  'Builds a conservative immutable display fingerprint; null means the record must remain ungrouped.';
comment on view public.public_result_groups is
  'Groups compatible cross-source results for display while retaining representative columns and every source URL; same-source collisions remain separate.';
comment on view public.public_results is
  'Compatibility public result relation backed by conservative cross-source display groups.';
comment on view public.public_player_search is
  'Public player summaries whose award and division counts consistently use grouped cross-source display results.';

notify pgrst, 'reload schema';
