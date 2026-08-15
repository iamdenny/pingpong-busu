-- Emergency availability rollback for the grouped result view.
--
-- The windowed fingerprint implementation introduced in 202608150005 must
-- evaluate the complete public result set before PostgREST filters by player.
-- Production therefore exceeds the statement timeout for both search and
-- player detail requests. Preserve the grouped view contract, but expose one
-- evidence row per result until grouping can be moved behind a bounded query.

create or replace view public.public_result_groups with (security_invoker = true) as
select
  r.id,
  r.source_id,
  r.source_player_identity_id,
  r.tournament_id,
  r.tournament_name_text,
  r.event_name,
  r.event_type,
  r.division_system,
  r.division_value,
  r.rank_text,
  r.club_text,
  r.partner_text,
  r.source_url,
  r.natural_key_hash,
  r.content_hash,
  r.first_seen_at,
  r.last_seen_at,
  r.last_checked_at,
  r.record_status,
  r.created_at,
  r.updated_at,
  r.source_published_on,
  s.code source_code,
  s.display_name source_name,
  p.public_id player_public_id,
  coalesce(t.scale, 'unknown'::public.tournament_scale) tournament_scale,
  t.held_on tournament_date,
  r.source_published_on source_published_date,
  coalesce(t.held_on, r.source_published_on) sort_date,
  public.infer_division_tournament_region(
    r.tournament_name_text,
    r.event_name
  ) tournament_region,
  public.effective_division_system(
    r.division_system,
    r.tournament_name_text,
    r.event_name,
    r.division_value,
    t.held_on,
    public.infer_division_tournament_region(r.tournament_name_text, r.event_name)
  ) effective_division_system,
  spi.source_region representative_source_region,
  'result:' || r.id::text result_fingerprint,
  jsonb_build_array(jsonb_build_object(
    'original_record_id', r.id,
    'source_code', s.code,
    'source_name', s.display_name,
    'source_url', r.source_url,
    'event', r.event_name,
    'club_text', r.club_text,
    'division_system', r.division_system,
    'effective_division_system', public.effective_division_system(
      r.division_system,
      r.tournament_name_text,
      r.event_name,
      r.division_value,
      t.held_on,
      public.infer_division_tournament_region(r.tournament_name_text, r.event_name)
    ),
    'division_value', r.division_value,
    'rank_text', r.rank_text,
    'partner_text', r.partner_text,
    'last_checked_at', r.last_checked_at
  )) sources,
  1::integer grouped_result_count
from public.results r
join public.sources s on s.id = r.source_id
join public.source_player_identities spi
  on spi.id = r.source_player_identity_id
  and spi.match_status <> 'disputed'
join public.players p on p.id = spi.player_id
left join public.tournaments t on t.id = r.tournament_id
where r.record_status <> 'disputed';

create or replace view public.public_results with (security_invoker = true) as
select * from public.public_result_groups;

grant select on public.public_result_groups, public.public_results to anon;

comment on view public.public_result_groups is
  'Availability-safe public result evidence; one result per group until bounded cross-source grouping is restored.';

notify pgrst, 'reload schema';
