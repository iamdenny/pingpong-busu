-- Astree live refresh was explicitly approved for this deployment.
-- The runtime still requires both CRAWL_LIVE and the adapter-specific secret.
update public.sources
set enabled = true, updated_at = now()
where code = 'astree';
