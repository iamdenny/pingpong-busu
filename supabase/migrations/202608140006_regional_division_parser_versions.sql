update public.sources
set parser_version = case code
  when 'airping' then 'airping-3'
  when 'astree' then 'astree-6'
  when 'newttplay' then 'newttplay-2'
  when 'okpingpong' then 'okpingpong-4'
  when 'mytt' then 'mytt-3'
  when 'superstar' then 'superstar-2'
  when 'yongintt' then 'yongintt-4'
  when 'iping' then 'iping-3'
  else parser_version
end,
updated_at = now()
where code in (
  'airping',
  'astree',
  'newttplay',
  'okpingpong',
  'mytt',
  'superstar',
  'yongintt',
  'iping'
);
