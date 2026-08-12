update public.results r
set division_system = case
  when concat_ws(' ', r.tournament_name_text, r.event_name, r.division_value) ~* '(^|[[:space:]])T[1-7]([[:space:]]|$)'
    or concat_ws(' ', r.tournament_name_text, r.event_name) ~ '디비전' then 'division'
  when r.event_name ~ '(여자|여성)'
    or concat_ws(' ', r.event_name, r.division_value) ~ '(여자|여성)[[:space:]]*(부수|[0-9]+[[:space:]]*부)' then 'women'
  when concat_ws(' ', r.tournament_name_text, r.event_name) ~ '오픈' then 'open'
  when concat_ws(' ', r.tournament_name_text, r.event_name) ~ '지역[[:space:]]*부수' then 'regional'
  else 'integrated'
end,
updated_at = now()
where r.division_value is not null;

update public.sources
set parser_version = case code
  when 'airping' then 'airping-2'
  when 'astree' then 'astree-4'
  when 'okpingpong' then 'okpingpong-2'
  when 'mytt' then 'mytt-2'
  else parser_version
end,
updated_at = now()
where code in ('airping', 'astree', 'okpingpong', 'mytt');
