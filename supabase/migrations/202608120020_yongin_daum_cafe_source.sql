alter table public.sources
drop constraint if exists sources_code_check;

alter table public.sources
add constraint sources_code_check
check (code in ('mock', 'airping', 'astree', 'ttadivision', 'okpingpong', 'mytt', 'superstar', 'yongintt', 'iping', 'band'));

insert into public.sources(code, display_name, base_url, adapter_mode, enabled, parser_version)
values ('yongintt', '용인탁구협회 다음 카페', 'https://cafe.daum.net/yongintt', 'http', false, 'yongintt-1')
on conflict (code) do update
set display_name = excluded.display_name,
  base_url = excluded.base_url,
  adapter_mode = excluded.adapter_mode,
  parser_version = excluded.parser_version,
  updated_at = now();

comment on column public.sources.enabled is
  'Each live source is opt-in. Yongin Cafe additionally requires the KAKAO_REST_API_KEY Edge secret.';
