update public.sources
set enabled = true,
  updated_at = now()
where code = 'newttplay';

comment on column public.sources.enabled is
  'Each live source is opt-in. Disable both this value and its Edge environment flag for an emergency stop.';
