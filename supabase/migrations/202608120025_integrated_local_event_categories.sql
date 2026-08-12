update public.results
set division_system = 'integrated',
    updated_at = now()
where division_system is distinct from 'division'
  and event_name ~ '(^|[[:space:](/·,&+-])지역(남성|여성|혼성)?([[:space:]]*([0-9]+([/／][0-9]+)?|[A-Za-z])[[:space:]]*부|[[:space:])／/·,&+-]|$)';

comment on column public.results.division_system is
  'Observed division system. Event-local 지역/지역남성/지역여성/지역혼성 categories are integrated even when the tournament name contains 오픈.';
