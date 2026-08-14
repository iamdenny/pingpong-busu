create or replace function public.division_integrated_from(p_region text)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when btrim(coalesce(p_region, '')) ~ '^(광주광역시|광주시|전라남도|전남)([[:space:]]|$)'
      then date '2017-01-01'
    when btrim(coalesce(p_region, '')) ~ '^(서울특별시|서울시|부산광역시|부산시|대구광역시|대구시|인천광역시|인천시|대전광역시|대전시|울산광역시|울산시|세종특별자치시|세종시|경기도|강원특별자치도|강원도|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|경상북도|경북|경상남도|경남|제주특별자치도|제주도)([[:space:]]|$)'
      then date '2022-07-01'
    else null
  end;
$$;

create or replace function public.infer_division_tournament_region(
  p_tournament_name text,
  p_event_name text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with evidence as (
    select regexp_replace(
      normalize(concat_ws(' ', p_tournament_name, p_event_name), NFKC),
      '[[:space:]]+',
      '',
      'g'
    ) value
  )
  select case
    when value ~ '(용인시|용인)' then '경기도 용인시'
    when value ~ '(화성시|화성)' then '경기도 화성시'
    when value ~ '(수원시|수원)' then '경기도 수원시'
    when value ~ '(여주시|여주)' then '경기도 여주시'
    when value ~ '(김포시|김포)' then '경기도 김포시'
    when value ~ '부천시' then '경기도 부천시'
    when value ~ '분당구' then '경기도 성남시 분당구'
    when value ~ '성남시' then '경기도 성남시'
    when value ~ '안양시' then '경기도 안양시'
    when value ~ '서대문구' then '서울특별시 서대문구'
    when value ~ '(안동시|안동)' then '경상북도 안동시'
    when value ~ '(영주시|영주)' then '경상북도 영주시'
    when value ~ '(정선군|정선)' then '강원특별자치도 정선군'
    when value ~ '(서울특별시|서울시)' then '서울특별시'
    when value ~ '(부산광역시|부산시)' then '부산광역시'
    when value ~ '(대구광역시|대구시)' then '대구광역시'
    when value ~ '(인천광역시|인천시)' then '인천광역시'
    when value ~ '광주광역시' then '광주광역시'
    when value ~ '(대전광역시|대전시)' then '대전광역시'
    when value ~ '(울산광역시|울산시)' then '울산광역시'
    when value ~ '(세종특별자치시|세종시)' then '세종특별자치시'
    when value ~ '경기도' then '경기도'
    when value ~ '(강원특별자치도|강원도)' then '강원특별자치도'
    when value ~ '(충청북도|충북)' then '충청북도'
    when value ~ '(충청남도|충남)' then '충청남도'
    when value ~ '(전북특별자치도|전라북도|전북)' then '전북특별자치도'
    when value ~ '(전라남도|전남)' then '전라남도'
    when value ~ '(경상북도|경북)' then '경상북도'
    when value ~ '(경상남도|경남)' then '경상남도'
    when value ~ '(제주특별자치도|제주도)' then '제주특별자치도'
    else null
  end
  from evidence;
$$;

create or replace function public.effective_division_system(
  p_observed_system text,
  p_tournament_name text,
  p_event_name text,
  p_division_value text,
  p_tournament_date date,
  p_tournament_region text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_evidence text := normalize(
    concat_ws(' ', p_tournament_name, p_event_name, p_division_value),
    NFKC
  );
  v_region text := p_tournament_region;
  v_local_event boolean := coalesce(
    p_event_name ~ '(^|[[:space:]([/·,&+-])지역(남성|여성|혼성)?([[:space:]]*([0-9]+([[:space:]]*[/／~～][[:space:]]*[0-9]+)?|[A-Z])[[:space:]]*부|[[:space:])\]/·,&+-]|$)',
    false
  );
  v_inferred text;
begin
  if regexp_replace(p_tournament_name, '[[:space:]]+', '', 'g')
       ~ '제([1-9]|1[0-8])회분당구청장기' then
    return 'regional';
  end if;
  if v_evidence ~ '디비전|(^|[[:space:]])T[1-7]($|[[:space:]])'
     or p_observed_system = 'division' then
    return 'division';
  end if;
  if v_evidence ~ '지역[[:space:]]*부수' then return 'regional'; end if;
  if v_region = '경기도 성남시 분당구'
     and p_tournament_date < public.division_integrated_from(v_region)
     and v_evidence !~ '오픈'
     and v_evidence !~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)' then
    return 'regional';
  end if;

  -- Parser output can depend on source-only evidence such as category or scale.
  -- Preserve trusted observations instead of rebuilding them from a lossy view.
  if p_observed_system = 'regional'
     or (p_observed_system = 'open' and not v_local_event) then
    return p_observed_system;
  end if;

  v_inferred := case
    when p_observed_system in ('integrated', 'women') then p_observed_system
    when v_local_event then 'integrated'
    when v_evidence ~ '(여자|여성)' then 'women'
    when v_evidence ~ '오픈' then 'open'
    when v_evidence ~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)' then 'integrated'
    when v_evidence ~ '([0-9]+|[A-Z])[[:space:]]*부(수)?' then 'integrated'
    else coalesce(p_observed_system, 'unknown')
  end;

  if v_inferred in ('integrated', 'women')
     and v_evidence !~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)'
     and (v_evidence !~ '오픈' or v_local_event)
     and p_tournament_date < public.division_integrated_from(v_region) then
    return 'regional';
  end if;
  return v_inferred;
end;
$$;

create or replace function public.is_historical_division_record(
  p_division_system text,
  p_tournament_date date,
  p_tournament_region text,
  p_tournament_name text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    p_division_system = 'regional'
      and (
        p_tournament_date < public.division_integrated_from(p_tournament_region)
        or regexp_replace(p_tournament_name, '[[:space:]]+', '', 'g')
          ~ '제([1-9]|1[0-8])회분당구청장기'
      ),
    false
  );
$$;

create or replace function public.is_pre_integrated_division_record(
  p_division_system text,
  p_tournament_date date,
  p_tournament_region text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    p_division_system = 'regional'
      and p_tournament_date < public.division_integrated_from(p_tournament_region),
    false
  );
$$;

revoke all on function public.division_integrated_from(text) from public;
revoke all on function public.infer_division_tournament_region(text, text) from public;
revoke all on function public.effective_division_system(text, text, text, text, date, text) from public;
revoke all on function public.is_pre_integrated_division_record(text, date, text) from public;
revoke all on function public.is_historical_division_record(text, date, text, text) from public;
grant execute on function public.division_integrated_from(text) to anon, authenticated, service_role;
grant execute on function public.infer_division_tournament_region(text, text) to anon, authenticated, service_role;
grant execute on function public.effective_division_system(text, text, text, text, date, text) to anon, authenticated, service_role;
grant execute on function public.is_pre_integrated_division_record(text, date, text) to anon, authenticated, service_role;
grant execute on function public.is_historical_division_record(text, date, text, text) to anon, authenticated, service_role;

create or replace view public.public_results with (security_invoker = true) as
select r.*, s.code source_code, s.display_name source_name, p.public_id player_public_id,
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
join public.source_player_identities spi on spi.id = r.source_player_identity_id
join public.players p on p.id = spi.player_id
left join public.tournaments t on t.id = r.tournament_id
where r.record_status <> 'disputed';

grant select on public.public_results to anon;

create or replace view public.public_player_search with (security_invoker = true) as
select p.public_id::text id,
  p.canonical_name,
  p.normalized_name,
  coalesce(
    (array_agg(
      nullif(
        btrim(
          case when source_meta.code = 'iping' then null else spi.source_region end
        ),
        ''
      )
      order by coalesce(t.held_on, r.source_published_on) desc nulls last,
        r.last_checked_at desc,
        r.id desc
    ) filter (
      where nullif(
        btrim(
          case when source_meta.code = 'iping' then null else spi.source_region end
        ),
        ''
      ) is not null
    ))[1],
    (array_agg(
      nullif(btrim(spi.source_region), '')
      order by spi.last_checked_at desc, spi.id desc
    ) filter (
      where r.id is not null
        and source_meta.code <> 'iping'
        and nullif(btrim(spi.source_region), '') is not null
    ))[1],
    null
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
    filter (
      where r.division_value is not null
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
  count(distinct r.id) filter (
    where public.is_award_rank(r.rank_text)
      and not public.is_historical_division_record(
        effective.division_system,
        t.held_on,
        public.infer_division_tournament_region(
          r.tournament_name_text,
          r.event_name
        ),
        r.tournament_name_text
      )
  )::integer result_count,
  count(distinct r.source_id)::integer source_count,
  coalesce(max(r.last_checked_at), p.updated_at) last_checked_at,
  p.identity_status,
  (array_agg(effective.division_system order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc)
    filter (
      where r.division_value is not null
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
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rank_text,
        'date', coalesce(t.held_on, r.source_published_on),
        'tournament', r.tournament_name_text,
        'last_checked_at', r.last_checked_at
      )
      order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc
    ) filter (
      where public.is_award_rank(r.rank_text)
        and not public.is_historical_division_record(
          effective.division_system,
          t.held_on,
          public.infer_division_tournament_region(
            r.tournament_name_text,
            r.event_name
          ),
          r.tournament_name_text
        )
    ),
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
      select coalesce(effective2.division_system, 'unknown') system,
        btrim(r2.division_value) division,
        count(distinct r2.id) filter (where public.is_award_rank(r2.rank_text))::integer award_count,
        count(distinct r2.id) filter (where not public.is_award_rank(r2.rank_text))::integer participation_count
      from public.source_player_identities spi2
      join public.results r2 on r2.source_player_identity_id = spi2.id
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
        and r2.record_status <> 'disputed'
        and nullif(btrim(r2.division_value), '') is not null
           and not public.is_historical_division_record(
             effective2.division_system,
             t2.held_on,
             public.infer_division_tournament_region(
               r2.tournament_name_text,
               r2.event_name
             ),
             r2.tournament_name_text
          )
      group by coalesce(effective2.division_system, 'unknown'), btrim(r2.division_value)
    ) observation
  ), '[]'::jsonb) division_observations,
  p.homonym_nickname,
  max(coalesce(t.held_on, r.source_published_on))
    filter (
      where not public.is_award_rank(r.rank_text)
        and not public.is_historical_division_record(
          effective.division_system,
          t.held_on,
          public.infer_division_tournament_region(
            r.tournament_name_text,
            r.event_name
          ),
          r.tournament_name_text
        )
    ) latest_participation_date,
  (array_agg(
    r.tournament_name_text
    order by coalesce(t.held_on, r.source_published_on) desc nulls last,
      r.last_checked_at desc,
      r.id desc
  ) filter (
    where not public.is_award_rank(r.rank_text)
      and not public.is_historical_division_record(
        effective.division_system,
        t.held_on,
        public.infer_division_tournament_region(
          r.tournament_name_text,
          r.event_name
        ),
        r.tournament_name_text
      )
      and nullif(btrim(r.tournament_name_text), '') is not null
  ))[1] latest_participation_tournament,
  (array_agg(
    r.last_checked_at
    order by coalesce(t.held_on, r.source_published_on) desc nulls last,
      r.last_checked_at desc,
      r.id desc
  ) filter (
    where not public.is_award_rank(r.rank_text)
      and not public.is_historical_division_record(
        effective.division_system,
        t.held_on,
        public.infer_division_tournament_region(
          r.tournament_name_text,
          r.event_name
        ),
        r.tournament_name_text
      )
  ))[1]
    latest_participation_checked_at
from public.players p
left join public.clubs c on c.id = p.primary_club_id
left join public.source_player_identities spi on spi.player_id = p.id
left join public.sources source_meta on source_meta.id = spi.source_id
left join public.results r
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
  'Public player search summaries that preserve historical records while excluding pre-transition regional divisions from current division estimates.';

notify pgrst, 'reload schema';
