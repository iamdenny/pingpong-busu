-- Follow-up for databases where 202608130008 was already applied.
-- Allow one explicitly assigned nickname group and user-entered nicknames.

alter table public.players
drop constraint if exists players_homonym_nickname_catalog_check,
drop constraint if exists players_homonym_nickname_check;

alter table public.players
add constraint players_homonym_nickname_check
check (
  homonym_nickname is null
  or (
    char_length(homonym_nickname) between 2 and 20
    and homonym_nickname = regexp_replace(btrim(homonym_nickname), '\\s+', ' ', 'g')
    and homonym_nickname !~ '[<>[:cntrl:]]'
    and homonym_nickname !~* '01[016789][ -]?[0-9]{3,4}[ -]?[0-9]{4}'
    and homonym_nickname !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    and homonym_nickname !~ '(19|20)[0-9]{2}[./-]?(0[1-9]|1[0-2])[./-]?(0[1-9]|[12][0-9]|3[01])'
    and homonym_nickname !~ '[0-9]{6}-?[1-4][0-9]{6}'
    and homonym_nickname !~ '(로|길|동|읍|면|리)[[:space:]]*[0-9]+(-[0-9]+)?'
  )
);

drop index if exists public.players_active_name_homonym_nickname_uidx;

create unique index players_active_name_homonym_nickname_uidx
on public.players(normalized_name, lower(homonym_nickname))
where homonym_nickname is not null
  and merged_into_player_id is null;

create or replace function public.homonym_nickname_label(
  p_code text
) returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_code is not null
      and char_length(btrim(p_code)) between 2 and 20
      and p_code !~ '[<>[:cntrl:]]'
      and p_code !~* '01[016789][ -]?[0-9]{3,4}[ -]?[0-9]{4}'
      and p_code !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
      and p_code !~ '(19|20)[0-9]{2}[./-]?(0[1-9]|1[0-2])[./-]?(0[1-9]|[12][0-9]|3[01])'
      and p_code !~ '[0-9]{6}-?[1-4][0-9]{6}'
      and p_code !~ '(로|길|동|읍|면|리)[[:space:]]*[0-9]+(-[0-9]+)?'
      then regexp_replace(btrim(p_code), '\s+', ' ', 'g')
    else null
  end;
$$;

revoke all on function public.homonym_nickname_label(text)
from public, anon, authenticated;

create or replace function public.apply_identity_partition_internal(
  p_groups jsonb,
  p_editor_hash text,
  p_fingerprint text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation_id uuid;
  v_candidate_count integer;
  v_name_count integer;
  v_normalized_name text;
  v_recent_count integer;
  v_reason text;
  v_group record;
  v_target_player_public_id uuid;
  v_target_player_id bigint;
  v_source_player_public_ids uuid[];
  v_merge_operation_id uuid;
begin
  if jsonb_typeof(p_groups) is distinct from 'array'
    or jsonb_array_length(p_groups) < 1
    or p_editor_hash !~ '^[0-9a-f]{64}$'
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_reason is not null and char_length(trim(p_reason)) not between 10 and 500)
  then
    raise exception 'invalid_identity_partition';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_fingerprint, 0)
  );

  if exists (
    select 1
    from jsonb_array_elements(p_groups) group_item(value)
    where jsonb_typeof(group_item.value) is distinct from 'object'
      or public.homonym_nickname_label(group_item.value->>'nickname') is null
      or case
        when jsonb_typeof(group_item.value->'player_public_ids') = 'array'
          then jsonb_array_length(group_item.value->'player_public_ids') < 1
        else true
      end
  ) or (
    select count(distinct lower(group_item.value->>'nickname'))
    from jsonb_array_elements(p_groups) group_item(value)
  ) <> jsonb_array_length(p_groups)
  then
    raise exception 'invalid_identity_partition';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_groups) group_item(value)
    cross join lateral jsonb_array_elements_text(
      group_item.value->'player_public_ids'
    ) candidate(value)
    where candidate.value !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid_identity_partition';
  end if;

  select count(*),
    count(distinct candidate.value)
  into v_candidate_count,
    v_recent_count
  from jsonb_array_elements(p_groups) group_item(value)
  cross join lateral jsonb_array_elements_text(
    group_item.value->'player_public_ids'
  ) candidate(value);

  if v_candidate_count < 1 or v_candidate_count <> v_recent_count then
    raise exception 'invalid_identity_partition';
  end if;

  select count(*),
    count(distinct player.normalized_name),
    min(player.normalized_name)
  into v_recent_count,
    v_name_count,
    v_normalized_name
  from public.players player
  where player.public_id in (
    select candidate.value::uuid
    from jsonb_array_elements(p_groups) group_item(value)
    cross join lateral jsonb_array_elements_text(
      group_item.value->'player_public_ids'
    ) candidate(value)
  )
    and player.merged_into_player_id is null;

  if v_recent_count <> v_candidate_count or v_name_count <> 1 then
    raise exception 'identity_partition_candidates_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('identity-name:' || v_normalized_name, 0)
  );

  select operation.id
  into v_operation_id
  from public.identity_partition_operations operation
  where operation.editor_hash = p_editor_hash
    and operation.fingerprint = p_fingerprint
    and operation.status = 'applied'
  order by operation.created_at desc
  limit 1;

  if v_operation_id is not null then
    return jsonb_build_object(
      'partition_id', v_operation_id,
      'group_count', jsonb_array_length(p_groups)
    );
  end if;

  perform player.id
  from public.players player
  where player.public_id in (
    select candidate.value::uuid
    from jsonb_array_elements(p_groups) group_item(value)
    cross join lateral jsonb_array_elements_text(
      group_item.value->'player_public_ids'
    ) candidate(value)
  )
  order by player.id
  for update;

  select count(*),
    count(distinct player.normalized_name),
    min(player.normalized_name)
  into v_recent_count,
    v_name_count,
    v_normalized_name
  from public.players player
  where player.public_id in (
    select candidate.value::uuid
    from jsonb_array_elements(p_groups) group_item(value)
    cross join lateral jsonb_array_elements_text(
      group_item.value->'player_public_ids'
    ) candidate(value)
  )
    and player.merged_into_player_id is null;

  if v_recent_count <> v_candidate_count or v_name_count <> 1 then
    raise exception 'identity_partition_candidates_mismatch';
  end if;

  if exists (
    select 1
    from public.players player
    where player.normalized_name = v_normalized_name
      and player.merged_into_player_id is null
      and lower(player.homonym_nickname) in (
        select lower(group_item.value->>'nickname')
        from jsonb_array_elements(p_groups) group_item(value)
      )
      and player.public_id not in (
        select candidate.value::uuid
        from jsonb_array_elements(p_groups) group_item(value)
        cross join lateral jsonb_array_elements_text(
          group_item.value->'player_public_ids'
        ) candidate(value)
      )
  ) then
    raise exception 'identity_partition_nickname_conflict';
  end if;

  select count(*)
  into v_recent_count
  from public.identity_partition_operations operation
  where operation.editor_hash = p_editor_hash
    and operation.normalized_name = v_normalized_name
    and operation.created_at >= now() - interval '24 hours';
  if v_recent_count >= 3 then
    raise exception 'identity_partition_rate_limited';
  end if;

  select count(*)
  into v_recent_count
  from public.identity_partition_operations operation
  where operation.created_at >= now() - interval '10 minutes';
  if v_recent_count >= 30 then
    raise exception 'identity_partition_rate_limited';
  end if;

  perform public.claim_identity_global_request_internal();

  v_reason := coalesce(
    nullif(trim(p_reason), ''),
    '참여자가 공개 대회 기록을 탁구 별칭으로 구분함'
  );

  insert into public.identity_partition_operations(
    normalized_name,
    editor_hash,
    fingerprint,
    reason
  ) values (
    v_normalized_name,
    p_editor_hash,
    p_fingerprint,
    v_reason
  ) returning id into v_operation_id;

  insert into public.identity_partition_members(
    operation_id,
    player_id,
    nickname,
    previous_homonym_nickname,
    previous_identity_status
  )
  select v_operation_id,
    player.id,
    group_item.value->>'nickname',
    player.homonym_nickname,
    player.identity_status
  from jsonb_array_elements(p_groups) group_item(value)
  cross join lateral jsonb_array_elements_text(
    group_item.value->'player_public_ids'
  ) candidate(value)
  join public.players player on player.public_id = candidate.value::uuid;

  update public.players player
  set homonym_nickname = null,
    updated_at = now()
  where player.public_id in (
    select candidate.value::uuid
    from jsonb_array_elements(p_groups) group_item(value)
    cross join lateral jsonb_array_elements_text(
      group_item.value->'player_public_ids'
    ) candidate(value)
  );

  for v_group in
    select group_item.ordinality::integer group_order,
      group_item.value->>'nickname' nickname,
      array_agg(candidate.value::uuid order by candidate.value) player_public_ids
    from jsonb_array_elements(p_groups)
      with ordinality group_item(value, ordinality)
    cross join lateral jsonb_array_elements_text(
      group_item.value->'player_public_ids'
    ) candidate(value)
    group by group_item.ordinality, group_item.value->>'nickname'
    order by group_item.ordinality
  loop
    select player.public_id,
      player.id
    into v_target_player_public_id,
      v_target_player_id
    from public.players player
    where player.public_id = any(v_group.player_public_ids)
      and player.merged_into_player_id is null
    order by (
        select count(*)
        from public.source_player_identities identity
        join public.results result
          on result.source_player_identity_id = identity.id
        where identity.player_id = player.id
          and result.record_status <> 'disputed'
      ) desc,
      (
        select count(*)
        from public.source_player_identities identity
        where identity.player_id = player.id
      ) desc,
      player.created_at,
      player.id
    limit 1;

    if v_target_player_public_id is null then
      raise exception 'identity_partition_stale';
    end if;

    v_merge_operation_id := null;
    if array_length(v_group.player_public_ids, 1) > 1 then
      select array_agg(candidate_id order by candidate_id)
      into v_source_player_public_ids
      from unnest(v_group.player_public_ids) candidates(candidate_id)
      where candidate_id <> v_target_player_public_id;

      v_merge_operation_id := public.merge_players_internal(
        v_target_player_public_id,
        v_source_player_public_ids,
        'community-partition:' || substring(p_editor_hash from 1 for 12),
        v_reason || ' · 별칭 ' || public.homonym_nickname_label(v_group.nickname),
        null
      );
    end if;

    update public.players
    set homonym_nickname = v_group.nickname,
      identity_status = 'verified',
      updated_at = now()
    where id = v_target_player_id;

    insert into public.identity_partition_groups(
      operation_id,
      group_order,
      nickname,
      target_player_id,
      merge_operation_id,
      candidate_count
    ) values (
      v_operation_id,
      v_group.group_order,
      v_group.nickname,
      v_target_player_id,
      v_merge_operation_id,
      array_length(v_group.player_public_ids, 1)
    );
  end loop;

  return jsonb_build_object(
    'partition_id', v_operation_id,
    'group_count', jsonb_array_length(p_groups)
  );
end;
$$;

revoke all on function public.apply_identity_partition_internal(
  jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_identity_partition_internal(
  jsonb, text, text, text
) to service_role;
