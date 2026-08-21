begin;

do $$
declare
  ranked_id bigint;
  quiet_id bigint;
  merged_id bigint;
  ranked_public uuid;
  quiet_public uuid;
  merged_public uuid;
  origin_hash text := repeat('a', 64);
  other_hash text := repeat('b', 64);
  bucket timestamptz := date_trunc('hour', now());
  ranked_rows integer;
begin
  insert into public.players (canonical_name, normalized_name)
  values ('조회순위선수', '조회순위선수')
  returning id, public_id into ranked_id, ranked_public;

  insert into public.players (canonical_name, normalized_name)
  values ('표본미달선수', '표본미달선수')
  returning id, public_id into quiet_id, quiet_public;

  insert into public.players (canonical_name, normalized_name)
  values ('병합된선수', '병합된선수')
  returning id, public_id into merged_id, merged_public;

  update public.players
  set merged_into_player_id = ranked_id, merged_at = now()
  where id = merged_id;

  -- One origin may lift the same player only once per hour.
  perform public.record_player_view_internal(ranked_public, origin_hash);
  perform public.record_player_view_internal(ranked_public, origin_hash);
  perform public.record_player_view_internal(ranked_public, origin_hash);

  if (
    select unique_sessions
    from public.player_view_counts
    where player_id = ranked_id and bucket_start = bucket
  ) <> 1 then
    raise exception 'repeated views from one origin were counted more than once';
  end if;

  -- An unknown player and a merged player are never counted.
  perform public.record_player_view_internal(
    '00000000-0000-4000-8000-000000000000'::uuid,
    other_hash
  );
  perform public.record_player_view_internal(merged_public, other_hash);

  if exists (
    select 1 from public.player_view_counts where player_id = merged_id
  ) then
    raise exception 'a merged player was counted';
  end if;

  -- A malformed origin hash is rejected without raising.
  perform public.record_player_view_internal(ranked_public, 'not-a-hash');

  -- Reach the unique session threshold for the ranked player only.
  insert into public.player_view_counts (player_id, bucket_start, unique_sessions)
  values (ranked_id, bucket - interval '1 hour', 4)
  on conflict (player_id, bucket_start)
  do update set unique_sessions = excluded.unique_sessions;

  insert into public.player_view_counts (player_id, bucket_start, unique_sessions)
  values (quiet_id, bucket, 4);

  select count(*) into ranked_rows
  from public.public_trending_players
  where player_id = ranked_public::text;
  if ranked_rows <> 1 then
    raise exception 'the player above the threshold is missing from the ranking';
  end if;

  if exists (
    select 1 from public.public_trending_players
    where player_id in (quiet_public::text, merged_public::text)
  ) then
    raise exception 'a player below the threshold or a merged player was ranked';
  end if;

  -- Counts that left the window are pruned and stop being ranked.
  insert into public.player_view_counts (player_id, bucket_start, unique_sessions)
  values (quiet_id, bucket - interval '30 hours', 50);

  insert into public.player_view_origins (origin_hash, player_id, bucket_start)
  values (other_hash, quiet_id, bucket - interval '30 hours');

  perform public.prune_player_view_counts_internal();

  if exists (
    select 1 from public.player_view_counts
    where bucket_start < now() - interval '25 hours'
  ) or exists (
    select 1 from public.player_view_origins
    where bucket_start < now() - interval '25 hours'
  ) then
    raise exception 'expired view aggregates were not pruned';
  end if;
end $$;

do $$
declare
  visible_counts integer;
begin
  -- Row level security, not a grant, is what closes the aggregates: the managed
  -- platform grants anon SELECT on new public tables through default privileges.
  if not exists (
    select 1 from pg_class
    where oid = 'public.player_view_counts'::regclass and relrowsecurity
  ) or not exists (
    select 1 from pg_class
    where oid = 'public.player_view_origins'::regclass and relrowsecurity
  ) then
    raise exception 'view aggregates do not enforce row level security';
  end if;

  if not has_table_privilege('anon', 'public.public_trending_players', 'select') then
    raise exception 'anon cannot read the public ranking';
  end if;

  if has_function_privilege('anon', 'public.record_player_view_internal(uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.prune_player_view_counts_internal()', 'execute')
  then
    raise exception 'a private view function is callable by anon';
  end if;

  set local role anon;
  select count(*) into visible_counts from public.player_view_counts;
  reset role;

  if visible_counts <> 0 then
    raise exception 'anon can read the private view aggregates';
  end if;
end $$;

rollback;
