-- Bounded 24-hour player view ranking for the home page.
--
-- Only two aggregate rows exist per counted view: an hourly per-player count
-- and an hourly (origin hash, player) marker used to keep one origin from
-- lifting the same player twice. Raw addresses, user agents and search terms
-- are never stored, and both tables are pruned an hour after they leave the
-- ranking window.

create table public.player_view_counts (
  player_id bigint not null references public.players on delete cascade,
  bucket_start timestamptz not null,
  unique_sessions integer not null default 0 check (unique_sessions >= 0),
  primary key (player_id, bucket_start)
);

create index player_view_counts_bucket_idx
on public.player_view_counts(bucket_start desc);

create table public.player_view_origins (
  origin_hash text not null check (origin_hash ~ '^[0-9a-f]{64}$'),
  player_id bigint not null references public.players on delete cascade,
  bucket_start timestamptz not null,
  primary key (origin_hash, player_id, bucket_start)
);

create index player_view_origins_bucket_idx
on public.player_view_origins(bucket_start desc);

alter table public.player_view_counts enable row level security;
alter table public.player_view_origins enable row level security;

revoke all on public.player_view_counts from public, anon, authenticated;
revoke all on public.player_view_origins from public, anon, authenticated;

-- The ranking reads a private table, so it deliberately runs as the view owner
-- instead of the invoking anon role. Only the ten bounded rows below are
-- exposed and no per-player subquery runs outside that limit.
create or replace view public.public_trending_players as
with ranked as (
  select
    v.player_id,
    sum(v.unique_sessions) total_sessions
  from public.player_view_counts v
  where v.bucket_start >= date_trunc('hour', now()) - interval '23 hours'
  group by v.player_id
  having sum(v.unique_sessions) >= 5
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

grant select on public.public_trending_players to anon;

create or replace function public.record_player_view_internal(
  p_public_id uuid,
  p_origin_hash text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id bigint;
  v_bucket timestamptz := date_trunc('hour', now());
  v_origin_players integer;
begin
  if p_public_id is null or p_origin_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select id into v_player_id
  from public.players
  where public_id = p_public_id
    and merged_into_player_id is null;

  if v_player_id is null then
    return;
  end if;

  select count(*) into v_origin_players
  from public.player_view_origins
  where origin_hash = p_origin_hash
    and bucket_start = v_bucket;

  -- One origin can lift at most 60 different players within an hour.
  if v_origin_players >= 60 then
    return;
  end if;

  insert into public.player_view_origins(origin_hash, player_id, bucket_start)
  values (p_origin_hash, v_player_id, v_bucket)
  on conflict do nothing;

  if not found then
    return;
  end if;

  insert into public.player_view_counts(player_id, bucket_start, unique_sessions)
  values (v_player_id, v_bucket, 1)
  on conflict (player_id, bucket_start)
  do update set unique_sessions = public.player_view_counts.unique_sessions + 1;
end;
$$;

create or replace function public.prune_player_view_counts_internal()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.player_view_origins
  where bucket_start < now() - interval '25 hours';

  delete from public.player_view_counts
  where bucket_start < now() - interval '25 hours';
end;
$$;

revoke all on function public.record_player_view_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.record_player_view_internal(uuid, text) to service_role;

revoke all on function public.prune_player_view_counts_internal() from public, anon, authenticated;
grant execute on function public.prune_player_view_counts_internal() to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'prune-player-view-counts',
  '41 * * * *',
  $$select public.prune_player_view_counts_internal();$$
);

comment on table public.player_view_counts is
  'Hourly public player view totals. Individual views are never stored.';
comment on table public.player_view_origins is
  'Hourly HMAC origin markers that keep one origin from counting the same player twice. Raw request origins are never stored.';
comment on view public.public_trending_players is
  'Bounded ten-row ranking of the players viewed most in the last 24 hours.';

notify pgrst, 'reload schema';
