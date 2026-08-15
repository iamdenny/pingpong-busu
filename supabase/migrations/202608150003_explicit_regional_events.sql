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
  v_event text := normalize(coalesce(p_event_name, ''), NFKC);
  v_explicit_regional_event boolean := coalesce(
    v_event ~* '(^|[[:space:]([/·,&+-])지역([[:space:]]*(남성|여성|혼성))?(([[:space:]]*([0-9]+([[:space:]]*[/~][[:space:]]*[0-9]+)?|[A-Z])[[:space:]]*부)|[[:space:])\]/·,&+-]|$)',
    false
  );
  v_inferred text;
begin
  if v_evidence ~* '디비전|(^|[[:space:]])T[1-7]($|[[:space:]])'
     or p_observed_system = 'division' then
    return 'division';
  end if;
  if regexp_replace(p_tournament_name, '[[:space:]]+', '', 'g')
       ~ '제([1-9]|1[0-8])회분당구청장기' then
    return 'regional';
  end if;
  if v_explicit_regional_event
     or v_evidence ~ '지역[[:space:]]*부수' then
    return 'regional';
  end if;
  if v_region = '경기도 성남시 분당구'
     and p_tournament_date < public.division_integrated_from(v_region)
     and v_evidence !~ '오픈'
     and v_evidence !~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)' then
    return 'regional';
  end if;

  if p_observed_system in ('regional', 'open') then
    return p_observed_system;
  end if;

  v_inferred := case
    when p_observed_system in ('integrated', 'women') then p_observed_system
    when v_evidence ~ '(여자|여성)' then 'women'
    when v_evidence ~ '오픈' then 'open'
    when v_evidence ~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)' then 'integrated'
    when v_evidence ~ '([0-9]+|[A-Z])[[:space:]]*부(수)?' then 'integrated'
    else coalesce(p_observed_system, 'unknown')
  end;

  if v_inferred in ('integrated', 'women')
     and v_evidence !~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)'
     and v_evidence !~ '오픈'
     and p_tournament_date < public.division_integrated_from(v_region) then
    return 'regional';
  end if;
  return v_inferred;
end;
$$;

comment on column public.results.division_system is
  'Source-observed division system; public views derive explicit regional event labels without mutating observation history.';

revoke all on function public.effective_division_system(text, text, text, text, date, text) from public;
grant execute on function public.effective_division_system(text, text, text, text, date, text) to anon, authenticated, service_role;
