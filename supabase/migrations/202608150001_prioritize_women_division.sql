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
  v_event_division_evidence text := normalize(
    concat_ws(' ', p_event_name, p_division_value),
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

  -- A women marker in the event or observed division is authoritative for
  -- current records, even when a source stored the generic integrated system.
  if v_event_division_evidence ~ '(여자|여성)'
     and v_evidence !~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)'
     and (v_evidence !~ '오픈' or v_local_event)
     and p_tournament_date < public.division_integrated_from(v_region) then
    return 'regional';
  end if;
  if v_event_division_evidence ~ '(여자|여성)' then return 'women'; end if;

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

comment on function public.effective_division_system(text, text, text, text, date, text) is
  'Returns the effective division system, prioritizing 여자/여성 markers in event or division values after historical regional and division-league rules.';

revoke all on function public.effective_division_system(text, text, text, text, date, text) from public;
grant execute on function public.effective_division_system(text, text, text, text, date, text) to anon, authenticated, service_role;

do $$
declare
  v_marked_records bigint;
  v_women_records bigint;
  v_exception_records bigint;
  v_mismatched_records bigint;
  v_mismatched_players bigint;
begin
  select
    count(*),
    count(*) filter (where effective.system = 'women'),
    count(*) filter (where effective.system in ('regional', 'division')),
    count(*) filter (where effective.system not in ('women', 'regional', 'division')),
    count(distinct spi.player_id) filter (
      where effective.system not in ('women', 'regional', 'division')
    )
  into
    v_marked_records,
    v_women_records,
    v_exception_records,
    v_mismatched_records,
    v_mismatched_players
  from public.results r
  join public.source_player_identities spi
    on spi.id = r.source_player_identity_id
  left join public.tournaments t on t.id = r.tournament_id
  cross join lateral (
    select public.effective_division_system(
      r.division_system,
      r.tournament_name_text,
      r.event_name,
      r.division_value,
      t.held_on,
      public.infer_division_tournament_region(
        r.tournament_name_text,
        r.event_name
      )
    ) system
  ) effective
  where r.record_status <> 'disputed'
    and normalize(concat_ws(' ', r.event_name, r.division_value), NFKC)
      ~ '(여자|여성)';

  if v_mismatched_records > 0 then
    raise exception
      'women division audit failed: % records across % players remain misclassified',
      v_mismatched_records,
      v_mismatched_players;
  end if;

  raise notice
    'women division audit passed: % marked records, % women records, % regional/division exceptions',
    v_marked_records,
    v_women_records,
    v_exception_records;
end;
$$;

notify pgrst, 'reload schema';
