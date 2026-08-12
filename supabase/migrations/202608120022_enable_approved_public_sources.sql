-- The repository owner reported source approval for Airping and OKPingpong.
-- Runtime requests remain guarded by CRAWL_LIVE, source-specific Edge secrets,
-- DB source state, timeout, and the shared per-source request throttle.
update public.sources
set enabled = true, updated_at = now()
where code in ('airping', 'okpingpong');
