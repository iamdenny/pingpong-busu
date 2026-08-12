create or replace view public.public_source_status with (security_invoker = true) as
select code,
  display_name,
  adapter_mode,
  enabled,
  parser_version,
  last_success_at,
  last_error_code,
  base_url
from public.sources
where code not in ('mock', 'band');

grant select on public.public_source_status to anon;
