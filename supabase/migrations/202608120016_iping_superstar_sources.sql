alter table public.sources
drop constraint if exists sources_code_check;

alter table public.sources
add constraint sources_code_check
check (code in ('mock', 'airping', 'astree', 'ttadivision', 'okpingpong', 'mytt', 'superstar', 'iping', 'band'));

insert into public.sources(code, display_name, base_url, adapter_mode, enabled, parser_version)
values
  ('superstar', '슈퍼스타탁구', 'https://www.superstar.kr/open/Do.jsp?urlSeq=302', 'http', true, 'superstar-1'),
  ('iping', '아이핑', 'https://www.iping.club/index.html', 'browser', false, 'auth-required-0')
on conflict (code) do update
set display_name = excluded.display_name,
  base_url = excluded.base_url,
  adapter_mode = excluded.adapter_mode,
  enabled = excluded.enabled,
  parser_version = excluded.parser_version,
  updated_at = now();

comment on column public.sources.parser_version is
  'Parser revision, or auth-required-0 when public player search requires login and no crawler is implemented.';
