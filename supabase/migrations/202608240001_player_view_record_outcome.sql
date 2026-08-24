-- Report which branch the player view recorder took.
--
-- The function returned void, so the Edge Function answered `recorded` whenever
-- the RPC raised no error. A silent early return (unknown player, duplicate
-- origin, spent origin budget) was indistinguishable from a real count, and the
-- ranking staying empty could not be diagnosed without database access. The
-- outcome is now part of the contract.
--
-- The return type changes, so the function is dropped and recreated. Only the
-- Edge Function calls it and it ignores the previous void result, so the brief
-- window between this migration and the function deployment is safe.

drop function if exists public.record_player_view_internal(uuid, text);

create function public.record_player_view_internal(
  p_public_id uuid,
  p_origin_hash text
) returns text
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
    return 'invalid_input';
  end if;

  select id into v_player_id
  from public.players
  where public_id = p_public_id
    and merged_into_player_id is null;

  if v_player_id is null then
    return 'unknown_player';
  end if;

  select count(*) into v_origin_players
  from public.player_view_origins
  where origin_hash = p_origin_hash
    and bucket_start = v_bucket;

  -- One origin can lift at most 60 different players within an hour.
  if v_origin_players >= 60 then
    return 'origin_budget';
  end if;

  insert into public.player_view_origins(origin_hash, player_id, bucket_start)
  values (p_origin_hash, v_player_id, v_bucket)
  on conflict do nothing;

  if not found then
    return 'duplicate_origin';
  end if;

  insert into public.player_view_counts(player_id, bucket_start, unique_sessions)
  values (v_player_id, v_bucket, 1)
  on conflict (player_id, bucket_start)
  do update set unique_sessions = public.player_view_counts.unique_sessions + 1;

  return 'counted';
end;
$$;

revoke all on function public.record_player_view_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.record_player_view_internal(uuid, text) to service_role;

comment on function public.record_player_view_internal(uuid, text) is
  'Records one hourly unique player view and reports which branch it took.';

notify pgrst, 'reload schema';
