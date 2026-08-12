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
    filter (where r.division_value is not null))[1] recent_observed_division_system,
  coalesce(
    jsonb_agg(
      jsonb_build_object('rank', r.rank_text, 'date', coalesce(t.held_on, r.source_published_on))
      order by coalesce(t.held_on, r.source_published_on) desc nulls last, r.last_checked_at desc, r.id desc
    ) filter (where public.is_award_rank(r.rank_text)),
    '[]'::jsonb
  ) award_results
from public.players p
left join public.clubs c on c.id = p.primary_club_id
left join public.source_player_identities spi on spi.player_id = p.id
left join public.results r on r.source_player_identity_id = spi.id and r.record_status <> 'disputed'
left join public.tournaments t on t.id = r.tournament_id
group by p.id, c.canonical_name;

comment on view public.public_player_search is
  'Public player search summaries with inferred region and dated award details.';
