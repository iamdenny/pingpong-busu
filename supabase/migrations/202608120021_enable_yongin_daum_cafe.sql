-- Yongin Cafe refresh uses Kakao's official Daum Cafe Search API within the
-- free quota. Runtime requests still require CRAWL_LIVE, the source flag,
-- KAKAO_REST_API_KEY, and the shared per-source request throttle.
update public.sources
set enabled = true, updated_at = now()
where code = 'yongintt';
