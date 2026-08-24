-- Widen the player view ranking from one day to thirty.
--
-- The 24-hour window shipped in 202608210002 never produced a row: at the
-- current traffic no player reaches five unique sessions within a day, so the
-- home section stayed hidden. Lowering the threshold instead would let two
-- clicks decide the front page, so the window grows and the threshold only
-- drops to three. The ranking is no longer a recency signal; it is what people
-- look up on this site.
--
-- Only the aggregate window changes. The hourly origin markers still expire
-- after 25 hours, so widening the ranking does not lengthen how long anything
-- derived from a request origin is kept.

create or replace view public.public_trending_players as
with ranked as (
  select
    v.player_id,
    sum(v.unique_sessions) total_sessions
  from public.player_view_counts v
  where v.bucket_start >= now() - interval '30 days'
  group by v.player_id
  having sum(v.unique_sessions) >= 3
  order by total_sessions desc, v.player_id
  limit 10
)
select
  row_number() over (order by r.total_sessions desc, p.public_id) rank,
  p.public_id::text player_id,
  p.canonical_name,
  p.primary_region,
  c.canonical_name primary_club,
  p.homonym_nickname
from ranked r
join public.players p
  on p.id = r.player_id
  and p.merged_into_player_id is null
left join public.clubs c on c.id = p.primary_club_id;

create or replace function public.prune_player_view_counts_internal()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Origin markers only need to outlive their own hourly dedup bucket.
  delete from public.player_view_origins
  where bucket_start < now() - interval '25 hours';

  delete from public.player_view_counts
  where bucket_start < now() - interval '31 days';
end;
$$;

comment on view public.public_trending_players is
  'Bounded ten-row ranking of the players viewed most in the last 30 days.';

notify pgrst, 'reload schema';
