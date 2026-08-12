update public.results
set division_value = null,
  updated_at = now()
where regexp_replace(division_value, '[[:space:]]+', '', 'g') ~* '^(null|undefined|none|n/?a)(부)?$';

notify pgrst, 'reload schema';
