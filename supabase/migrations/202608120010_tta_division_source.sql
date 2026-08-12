alter table public.sources
drop constraint if exists sources_code_check;

alter table public.sources
add constraint sources_code_check
check (code in ('mock', 'airping', 'astree', 'ttadivision', 'okpingpong', 'mytt', 'band'));

alter table public.results
drop constraint if exists results_division_system_check;

alter table public.results
add constraint results_division_system_check
check (division_system is null or division_system in ('open', 'integrated', 'women', 'regional', 'division', 'unknown'));

insert into public.sources(code, display_name, base_url, adapter_mode, enabled, parser_version)
values ('ttadivision', '대한탁구협회 디비전', 'https://ttadivision.sports.or.kr/', 'http', true, 'ttadivision-1')
on conflict (code) do update
set display_name = excluded.display_name,
  base_url = excluded.base_url,
  adapter_mode = excluded.adapter_mode,
  enabled = excluded.enabled,
  parser_version = excluded.parser_version,
  updated_at = now();
