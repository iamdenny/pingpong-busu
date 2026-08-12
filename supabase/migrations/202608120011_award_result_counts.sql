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
      or regexp_replace(p_rank_text, '[[:space:]]+', '', 'g') ~ '(^|[^0-9])4강([^0-9]|$)'
  end;
$$;

comment on function public.is_award_rank(text) is
  'Returns true only for semifinal (4강) or better public result labels.';

create or replace view public.public_player_search with (security_invoker = true) as
select p.public_id::text id,
  p.canonical_name,
  p.normalized_name,
  p.primary_region,
  c.canonical_name primary_club,
  (array_agg(r.division_value order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc)
    filter (where r.division_value is not null))[1] recent_observed_division,
  count(distinct r.id) filter (where public.is_award_rank(r.rank_text))::integer result_count,
  count(distinct r.source_id)::integer source_count,
  coalesce(max(r.last_checked_at), p.updated_at) last_checked_at,
  p.identity_status,
  (array_agg(r.division_system order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc)
    filter (where r.division_value is not null))[1] recent_observed_division_system
from public.players p
left join public.clubs c on c.id = p.primary_club_id
left join public.source_player_identities spi on spi.player_id = p.id
left join public.results r on r.source_player_identity_id = spi.id and r.record_status <> 'disputed'
left join public.tournaments t on t.id = r.tournament_id
group by p.id, c.canonical_name;
