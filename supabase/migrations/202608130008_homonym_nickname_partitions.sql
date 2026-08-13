alter table public.players
add column homonym_nickname text,
add constraint players_homonym_nickname_check
check (
  homonym_nickname is null
  or (
    char_length(homonym_nickname) between 2 and 20
    and homonym_nickname = regexp_replace(btrim(homonym_nickname), '\s+', ' ', 'g')
    and homonym_nickname !~ '[<>[:cntrl:]]'
  )
);

create unique index players_active_name_homonym_nickname_uidx
on public.players(normalized_name, lower(homonym_nickname))
where homonym_nickname is not null
  and merged_into_player_id is null;

create table public.identity_partition_operations (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null check (char_length(normalized_name) between 1 and 100),
  editor_hash text not null check (editor_hash ~ '^[0-9a-f]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'applied' check (status in ('applied', 'reverted')),
  reason text not null check (char_length(reason) between 10 and 500),
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by text check (reverted_by is null or reverted_by ~ '^[0-9a-f]{64}$'),
  revert_reason text check (
    revert_reason is null or char_length(revert_reason) between 10 and 500
  ),
  check (
    (status = 'applied' and reverted_at is null and reverted_by is null and revert_reason is null)
    or
    (status = 'reverted' and reverted_at is not null and reverted_by is not null and revert_reason is not null)
  )
);

create unique index identity_partition_active_fingerprint_uidx
on public.identity_partition_operations(editor_hash, fingerprint)
where status = 'applied';

create index identity_partition_name_created_idx
on public.identity_partition_operations(normalized_name, created_at desc);

create table public.identity_partition_groups (
  operation_id uuid not null
    references public.identity_partition_operations(id) on delete restrict,
  group_order integer not null check (group_order >= 1),
  nickname text not null,
  target_player_id bigint not null references public.players(id) on delete restrict,
  merge_operation_id uuid
    references public.identity_merge_operations(id) on delete restrict,
  candidate_count integer not null check (candidate_count >= 1),
  primary key (operation_id, group_order),
  unique (operation_id, nickname),
  unique (operation_id, target_player_id)
);

create table public.identity_partition_members (
  operation_id uuid not null
    references public.identity_partition_operations(id) on delete restrict,
  player_id bigint not null references public.players(id) on delete restrict,
  nickname text not null,
  previous_homonym_nickname text,
  previous_identity_status public.identity_status not null,
  primary key (operation_id, player_id)
);

alter table public.identity_partition_operations enable row level security;
alter table public.identity_partition_groups enable row level security;
alter table public.identity_partition_members enable row level security;

revoke all on public.identity_partition_operations,
  public.identity_partition_groups,
  public.identity_partition_members
from public, anon, authenticated;

create or replace function public.claim_identity_community_request_internal(
  p_editor_hash text,
  p_origin_hash text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_editor_hash !~ '^[0-9a-f]{64}$'
    or p_origin_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_identity_community_request';
  end if;

  insert into public.identity_community_request_budgets(scope, identity_hash)
  values ('origin', p_origin_hash), ('editor', p_editor_hash)
  on conflict do nothing;

  perform budget.scope
  from public.identity_community_request_budgets budget
  where (budget.scope, budget.identity_hash) in (
    ('origin', p_origin_hash),
    ('editor', p_editor_hash)
  )
  order by budget.scope, budget.identity_hash
  for update;

  if exists (
    select 1
    from public.identity_community_request_budgets budget
    where (budget.scope = 'origin'
        and budget.identity_hash = p_origin_hash
        and budget.window_started_at > now() - interval '10 minutes'
        and budget.request_count >= 10)
      or (budget.scope = 'editor'
        and budget.identity_hash = p_editor_hash
        and budget.window_started_at > now() - interval '24 hours'
        and budget.request_count >= 6)
  ) then
    raise exception 'identity_community_rate_limited';
  end if;

  update public.identity_community_request_budgets budget
  set request_count = case
        when budget.window_started_at <= now() - case budget.scope
          when 'editor' then interval '24 hours'
          else interval '10 minutes'
        end then 1
        else budget.request_count + 1
      end,
      window_started_at = case
        when budget.window_started_at <= now() - case budget.scope
          when 'editor' then interval '24 hours'
          else interval '10 minutes'
        end then now()
        else budget.window_started_at
      end,
      last_requested_at = now()
  where (budget.scope, budget.identity_hash) in (
    ('origin', p_origin_hash),
    ('editor', p_editor_hash)
  );
end;
$$;

revoke all on function public.claim_identity_community_request_internal(
  text, text
) from public, anon, authenticated;
grant execute on function public.claim_identity_community_request_internal(
  text, text
) to service_role;

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

  v_reason := case p_reason
    when 'club-and-region-comparison' then '공개 소속·지역 기록 비교'
    when 'event-history-comparison' then '공개 출전 종목 이력 비교'
    else '공개 대회 기록 비교'
  end;

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

create or replace function public.revert_identity_partition_internal(
  p_operation_id uuid,
  p_actor_hash text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation record;
  v_group record;
begin
  if p_operation_id is null
    or p_actor_hash !~ '^[0-9a-f]{64}$'
    or char_length(trim(coalesce(p_reason, ''))) not between 10 and 500
  then
    raise exception 'invalid_identity_partition_revert';
  end if;

  select operation.*
  into v_operation
  from public.identity_partition_operations operation
  where operation.id = p_operation_id;

  if not found or v_operation.status <> 'applied' then
    raise exception 'identity_edit_revert_not_allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'identity-name:' || v_operation.normalized_name,
      0
    )
  );

  select operation.*
  into v_operation
  from public.identity_partition_operations operation
  where operation.id = p_operation_id
  for update;

  if not found or v_operation.status <> 'applied' then
    raise exception 'identity_edit_revert_not_allowed';
  end if;

  if exists (
    select 1
    from public.identity_partition_operations later_operation
    where later_operation.normalized_name = v_operation.normalized_name
      and later_operation.status = 'applied'
      and later_operation.id <> v_operation.id
      and (
        later_operation.created_at > v_operation.created_at
        or (
          later_operation.created_at = v_operation.created_at
          and later_operation.id::text > v_operation.id::text
        )
      )
  ) then
    raise exception 'player_merge_has_later_operations';
  end if;

  for v_group in
    select partition_group.*
    from public.identity_partition_groups partition_group
    where partition_group.operation_id = p_operation_id
      and partition_group.merge_operation_id is not null
    order by partition_group.group_order desc
  loop
    perform public.revert_player_merge_internal(
      v_group.merge_operation_id,
      'community:' || substring(p_actor_hash from 1 for 12),
      trim(p_reason)
    );
  end loop;

  update public.players player
  set homonym_nickname = null,
    updated_at = now()
  from public.identity_partition_members member
  where member.operation_id = p_operation_id
    and player.id = member.player_id;

  update public.players player
  set homonym_nickname = member.previous_homonym_nickname,
    identity_status = member.previous_identity_status,
    updated_at = now()
  from public.identity_partition_members member
  where member.operation_id = p_operation_id
    and player.id = member.player_id;

  update public.identity_partition_operations
  set status = 'reverted',
    reverted_at = now(),
    reverted_by = p_actor_hash,
    revert_reason = case p_reason
      when 'wrong-alias-assignment' then '기록이 잘못된 별칭에 배정됨'
      when 'insufficient-public-evidence' then '공개 기록 근거가 부족함'
      else '다른 사람 기록이 함께 묶임'
    end
  where id = p_operation_id;

  return p_operation_id;
end;
$$;

revoke all on function public.revert_identity_partition_internal(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.revert_identity_partition_internal(
  uuid, text, text
) to service_role;

create or replace function public.revert_identity_edit_community_internal(
  p_operation_id uuid,
  p_actor_hash text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation_id uuid;
  v_normalized_name text;
begin
  if p_operation_id is null
    or p_actor_hash !~ '^[0-9a-f]{64}$'
    or char_length(trim(coalesce(p_reason, ''))) not between 10 and 500
  then
    raise exception 'invalid_identity_edit_revert';
  end if;

  select operation_name.normalized_name
  into v_normalized_name
  from (
    select partition.normalized_name
    from public.identity_partition_operations partition
    where partition.id = p_operation_id
      and partition.status = 'applied'
    union all
    select target.normalized_name
    from public.identity_merge_operations merge_operation
    join public.players target on target.id = merge_operation.target_player_id
    where merge_operation.id = p_operation_id
      and merge_operation.status = 'applied'
      and merge_operation.identity_claim_id is not null
      and merge_operation.performed_by like 'community:%'
  ) operation_name
  limit 1;

  if v_normalized_name is null then
    raise exception 'identity_edit_revert_not_allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('identity-name:' || v_normalized_name, 0)
  );

  perform public.claim_identity_global_request_internal();

  if exists (
    select 1
    from public.identity_partition_operations operation
    where operation.id = p_operation_id
  ) then
    return public.revert_identity_partition_internal(
      p_operation_id,
      p_actor_hash,
      p_reason
    );
  end if;

  select operation.id
  into v_operation_id
  from public.identity_merge_operations operation
  where operation.id = p_operation_id
    and operation.status = 'applied'
    and operation.identity_claim_id is not null
    and operation.performed_by like 'community:%';

  if v_operation_id is null then
    raise exception 'identity_edit_revert_not_allowed';
  end if;

  return public.revert_player_merge_internal(
    p_operation_id,
    'community:' || substring(p_actor_hash from 1 for 12),
    trim(p_reason)
  );
end;
$$;

revoke all on function public.revert_identity_edit_community_internal(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.revert_identity_edit_community_internal(
  uuid, text, text
) to service_role;

create or replace function public.list_identity_edit_history(
  p_normalized_name text
) returns table (
  operation_id uuid,
  reference_id text,
  normalized_name text,
  status text,
  target_player_id text,
  target_player_name text,
  reason text,
  created_at timestamptz,
  reverted_at timestamptz,
  revert_reason text,
  can_revert boolean,
  candidates jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with partition_history as (
    select operation.id operation_id,
      upper(substring(operation.id::text from 1 for 8)) reference_id,
      operation.normalized_name,
      operation.status,
      first_target.public_id::text target_player_id,
      first_target.canonical_name target_player_name,
      operation.reason,
      operation.created_at,
      operation.reverted_at,
      operation.revert_reason,
      operation.status = 'applied'
        and not exists (
          select 1
          from public.identity_partition_operations later_operation
          where later_operation.normalized_name = operation.normalized_name
            and later_operation.status = 'applied'
            and later_operation.id <> operation.id
            and (
              later_operation.created_at > operation.created_at
              or (
                later_operation.created_at = operation.created_at
                and later_operation.id::text > operation.id::text
              )
            )
        ) can_revert,
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id', member_player.public_id,
            'name', member_player.canonical_name,
            'region', member_player.primary_region,
            'club', member_club.canonical_name,
            'group_nickname', member.nickname
          )
          order by member.nickname, member_player.public_id
        )
        from public.identity_partition_members member
        join public.players member_player on member_player.id = member.player_id
        left join public.clubs member_club
          on member_club.id = member_player.primary_club_id
        where member.operation_id = operation.id
      ) candidates
    from public.identity_partition_operations operation
    join public.identity_partition_groups first_group
      on first_group.operation_id = operation.id
      and first_group.group_order = 1
    join public.players first_target
      on first_target.id = first_group.target_player_id
    where operation.normalized_name = p_normalized_name
      and char_length(p_normalized_name) between 1 and 100
  ),
  legacy_history as (
    select merge_operation.id operation_id,
      upper(substring(claim.id::text from 1 for 8)) reference_id,
      target.normalized_name,
      merge_operation.status,
      target.public_id::text target_player_id,
      target.canonical_name target_player_name,
      merge_operation.reason,
      merge_operation.created_at,
      merge_operation.reverted_at,
      merge_operation.revert_reason,
      merge_operation.status = 'applied'
        and not exists (
          select 1
          from public.identity_merge_operations later_operation
          where later_operation.target_player_id = merge_operation.target_player_id
            and later_operation.status = 'applied'
            and later_operation.id <> merge_operation.id
            and (
              later_operation.created_at > merge_operation.created_at
              or (
                later_operation.created_at = merge_operation.created_at
                and later_operation.id::text > merge_operation.id::text
              )
            )
        ) can_revert,
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id', member.public_id,
            'name', member.canonical_name,
            'region', member.primary_region,
            'club', member.club_name,
            'group_nickname', null
          )
          order by member.is_target desc, member.public_id
        )
        from (
          select target.public_id::text public_id,
            target.canonical_name,
            target.primary_region,
            target_club.canonical_name club_name,
            true is_target
          union all
          select source.public_id::text,
            source.canonical_name,
            source.primary_region,
            source_club.canonical_name,
            false
          from public.identity_merge_operation_players item
          join public.players source on source.id = item.source_player_id
          left join public.clubs source_club
            on source_club.id = source.primary_club_id
          where item.operation_id = merge_operation.id
        ) member
      ) candidates
    from public.identity_merge_operations merge_operation
    join public.identity_claims claim
      on claim.id = merge_operation.identity_claim_id
    join public.players target on target.id = merge_operation.target_player_id
    left join public.clubs target_club on target_club.id = target.primary_club_id
    where target.normalized_name = p_normalized_name
      and char_length(p_normalized_name) between 1 and 100
      and merge_operation.performed_by like 'community:%'
      and not exists (
        select 1
        from public.identity_partition_groups partition_group
        where partition_group.merge_operation_id = merge_operation.id
      )
  )
  select * from partition_history
  union all
  select * from legacy_history
  order by created_at desc, operation_id desc;
$$;

revoke all on function public.list_identity_edit_history(text) from public;
grant execute on function public.list_identity_edit_history(text)
to anon, authenticated;

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
  ) award_results,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'system', observation.system,
        'division', observation.division,
        'award_count', observation.award_count,
        'participation_count', observation.participation_count
      ) order by observation.system, observation.division
    )
    from (
      select coalesce(r2.division_system, 'unknown') system,
        btrim(r2.division_value) division,
        count(distinct r2.id) filter (where public.is_award_rank(r2.rank_text))::integer award_count,
        count(distinct r2.id) filter (where not public.is_award_rank(r2.rank_text))::integer participation_count
      from public.source_player_identities spi2
      join public.results r2 on r2.source_player_identity_id = spi2.id
      where spi2.player_id = p.id
        and r2.record_status <> 'disputed'
        and nullif(btrim(r2.division_value), '') is not null
      group by coalesce(r2.division_system, 'unknown'), btrim(r2.division_value)
    ) observation
  ), '[]'::jsonb) division_observations,
  p.homonym_nickname
from public.players p
left join public.clubs c on c.id = p.primary_club_id
left join public.source_player_identities spi on spi.player_id = p.id
left join public.results r
  on r.source_player_identity_id = spi.id
  and r.record_status <> 'disputed'
left join public.tournaments t on t.id = r.tournament_id
where p.merged_into_player_id is null
group by p.id, c.canonical_name;

comment on column public.players.homonym_nickname is
  'User-entered playful table-tennis alias used only to distinguish same-name public record groups; not a skill rating.';
comment on table public.identity_partition_operations is
  'Atomic, publicly auditable community partitions of same-name records into user-entered nickname groups.';
comment on function public.apply_identity_partition_internal(jsonb, text, text, text) is
  'Applies one or more explicit nickname groups without a candidate-count cap, preserving reversible merge snapshots.';
comment on function public.revert_identity_partition_internal(uuid, text, text) is
  'Reverts every nickname and merge created by one identity partition as a single transaction.';
comment on view public.public_player_search is
  'Public player search summaries with inferred region, dated awards, division counts, and optional homonym nickname.';

notify pgrst, 'reload schema';
