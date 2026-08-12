-- iPing is implemented as a server-side authenticated HTTP source.
-- Production credentials and the source flag are configured before this
-- migration is deployed, so the catalog entry can be enabled atomically.
update public.sources
set
  base_url = 'https://www.iping.club/?pg=Search',
  adapter_mode = 'http',
  enabled = true,
  parser_version = 'iping-1',
  updated_at = now()
where code = 'iping';

comment on table public.sources is
  'Source catalog. Live sources require CRAWL_LIVE, a source-specific flag, DB enabled state, and any source-specific runtime secrets.';
