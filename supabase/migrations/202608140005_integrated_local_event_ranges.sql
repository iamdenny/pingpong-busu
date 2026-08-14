update public.results
set division_system = 'integrated',
    updated_at = now()
where division_system is distinct from 'division'
  and event_name ~ '(^|[[:space:](/·,&+-])지역(남성|여성|혼성)?[[:space:]]*[0-9]+[[:space:]]*[~～][[:space:]]*[0-9]+[[:space:]]*부';

update public.results
set division_system = 'regional',
    updated_at = now()
where regexp_replace(tournament_name_text, '[[:space:]]+', '', 'g')
  ~ '제([1-9]|1[0-6])회분당구청장기|제18회분당구청장기탁구대회';

comment on column public.results.division_system is
  'Observed division system after version-controlled evidence rules. Event-local 지역 ranges are integrated, while confirmed Bundang-gu Office Cup overrides remain regional.';
