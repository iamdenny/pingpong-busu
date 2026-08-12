-- Airping and OKPingpong parsers are ready, but their published terms require
-- prior approval for redistribution. Keep both operational switches off.
update public.sources
set adapter_mode = 'http', enabled = false, parser_version = 'airping-1', updated_at = now()
where code = 'airping';

update public.sources
set adapter_mode = 'http', enabled = false, parser_version = 'okpingpong-1', updated_at = now()
where code = 'okpingpong';

-- MyTT exposes the participant search to non-members, allows all crawlers in
-- robots.txt, and works with a standard short-lived JSF form session.
update public.sources
set adapter_mode = 'http', enabled = true, parser_version = 'mytt-1', updated_at = now()
where code = 'mytt';

create or replace function public.is_award_rank(p_rank_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rank_text is null then false
    else
      position('우승' in regexp_replace(p_rank_text, '[[:space:]]+', '', 'g')) > 0
      or regexp_replace(p_rank_text, '[[:space:]]+', '', 'g') ~ '(^|[^0-9])[123]위([^0-9]|$)'
      or regexp_replace(p_rank_text, '[[:space:]]+', '', 'g') ~ '(^|[^0-9])(2|4)강([^0-9]|$)'
  end;
$$;

comment on function public.is_award_rank(text) is
  'Returns true only for semifinal (4강), final (2강), or better public result labels.';
