update public.results
set division_system = 'regional',
    updated_at = now()
where regexp_replace(tournament_name_text, '[[:space:]]+', '', 'g')
  ~ '제([1-9]|1[0-6])회분당구청장기';

comment on column public.results.division_system is
  'Observed division system after version-controlled tournament overrides. Bundang-gu Office Cup editions through the 16th use regional divisions.';
