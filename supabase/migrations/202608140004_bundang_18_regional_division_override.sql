update public.results
set division_system = 'regional',
    updated_at = now()
where regexp_replace(tournament_name_text, '[[:space:]]+', '', 'g')
  ~ '제18회분당구청장기탁구대회';

comment on column public.results.division_system is
  'Observed division system after version-controlled tournament overrides. Bundang-gu Office Cup editions through the 16th plus the 18th use regional divisions.';
