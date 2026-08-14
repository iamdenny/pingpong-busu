alter table public.sources
drop constraint if exists sources_code_check;

alter table public.sources
add constraint sources_code_check
check (code in ('mock', 'airping', 'astree', 'newttplay', 'ttadivision', 'okpingpong', 'mytt', 'superstar', 'yongintt', 'iping', 'band'));

insert into public.sources(code, display_name, base_url, adapter_mode, enabled, parser_version)
values (
  'newttplay',
  '뉴티티플레이',
  'https://www.newttplay.co.kr/bbs/board.php?bo_table=member_search',
  'http',
  false,
  'newttplay-1'
)
on conflict (code) do update
set display_name = excluded.display_name,
  base_url = excluded.base_url,
  adapter_mode = excluded.adapter_mode,
  parser_version = excluded.parser_version,
  updated_at = now();

comment on column public.sources.enabled is
  'Each live source is opt-in. NewTTPlay remains disabled until operating permission is confirmed.';
