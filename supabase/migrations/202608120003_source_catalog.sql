insert into public.sources(code, display_name, base_url, adapter_mode, enabled, parser_version)
values
  ('mock', '가상 출처', 'https://example.invalid/mock', 'http', false, 'mock-1'),
  ('airping', '에어핑퐁', 'https://airping.co.kr/', 'http', false, 'skeleton-0'),
  ('astree', '애즈트리', 'https://astree.co.kr/', 'http', false, 'astree-1'),
  ('okpingpong', '오케이핑퐁', 'http://okpingpong.co.kr/', 'http', false, 'skeleton-0'),
  ('mytt', '마이티티', 'https://mytt.kr/', 'browser', false, 'skeleton-0'),
  ('band', '밴드', 'https://band.us/', 'manual', false, 'manual-0')
on conflict (code) do update
set
  display_name = excluded.display_name,
  base_url = excluded.base_url,
  adapter_mode = excluded.adapter_mode,
  parser_version = excluded.parser_version,
  updated_at = now();
