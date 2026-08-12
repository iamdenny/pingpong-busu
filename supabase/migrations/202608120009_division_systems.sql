update public.results r
set division_system = case
  when concat_ws(' ', r.division_system, r.tournament_name_text, r.event_name, r.division_value) ~ '(여자|여성)[[:space:]]*(부수|[0-9]+[[:space:]]*부)' then 'women'
  when concat_ws(' ', r.division_system, r.tournament_name_text, r.event_name, r.division_value) ~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)' then 'integrated'
  when concat_ws(' ', r.division_system, r.tournament_name_text, r.event_name, r.division_value) ~ '오픈' then 'open'
  when concat_ws(' ', r.division_system, r.tournament_name_text, r.event_name, r.division_value) ~ '지역'
    or exists (select 1 from public.tournaments t where t.id = r.tournament_id and t.region is not null) then 'regional'
  else 'unknown'
end,
updated_at = now()
where r.division_value is not null;

update public.sources
set parser_version = 'astree-3', updated_at = now()
where code = 'astree';

alter table public.results
add constraint results_division_system_check
check (division_system is null or division_system in ('open', 'integrated', 'women', 'regional', 'unknown'));

create or replace view public.public_player_search with (security_invoker = true) as
select p.public_id::text id,
  p.canonical_name,
  p.normalized_name,
  p.primary_region,
  c.canonical_name primary_club,
  (array_agg(r.division_value order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc)
    filter (where r.division_value is not null))[1] recent_observed_division,
  count(distinct r.id)::integer result_count,
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
