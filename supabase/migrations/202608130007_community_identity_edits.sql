drop view if exists public.identity_claim_review_queue;

alter table public.identity_claims
drop constraint if exists identity_claims_candidate_count_check;

alter table public.identity_claims
alter column candidate_count type integer;

alter table public.identity_claims
add constraint identity_claims_candidate_count_positive
check (candidate_count >= 1);

update public.identity_claims
set status = 'rejected',
  reviewed_by = 'system:community-edit-migration',
  review_note = '관리자 승인 대기 방식 종료로 미반영 종결; 공개 참여 편집에서 다시 선택 가능'
where status = 'pending';

create or replace function public.submit_identity_claim_internal(
  p_player_public_ids uuid[],
  p_verification_hash text,
  p_candidate_fingerprint text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_count integer;
  v_name_count integer;
  v_normalized_name text;
  v_claim_id uuid;
  v_recent_count integer;
begin
  if coalesce(array_length(p_player_public_ids, 1), 0) < 1
    or (
      select count(distinct value)
      from unnest(p_player_public_ids) as ids(value)
    ) <> array_length(p_player_public_ids, 1)
    or p_verification_hash !~ '^[0-9a-f]{64}$'
    or p_candidate_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_note is not null and char_length(p_note) not between 10 and 500)
  then
    raise exception 'invalid_identity_claim';
  end if;

  select count(*),
    count(distinct player.normalized_name),
    min(player.normalized_name)
  into v_candidate_count,
    v_name_count,
    v_normalized_name
  from public.players player
  where player.public_id = any(p_player_public_ids);

  if v_candidate_count <> array_length(p_player_public_ids, 1)
    or v_name_count <> 1
  then
    raise exception 'identity_claim_candidates_mismatch';
  end if;

  select claim.id
  into v_claim_id
  from public.identity_claims claim
  where claim.verification_hash = p_verification_hash
    and claim.candidate_fingerprint = p_candidate_fingerprint
    and claim.created_at >= now() - interval '24 hours'
  order by claim.created_at desc
  limit 1;
  if v_claim_id is not null then return v_claim_id; end if;

  select count(*)
  into v_recent_count
  from public.identity_claims claim
  where claim.verification_hash = p_verification_hash
    and claim.created_at >= now() - interval '24 hours';
  if v_recent_count >= 3 then
    raise exception 'identity_claim_rate_limited';
  end if;

  select count(*)
  into v_recent_count
  from public.identity_claims claim
  where claim.created_at >= now() - interval '10 minutes';
  if v_recent_count >= 30 then
    raise exception 'identity_claim_rate_limited';
  end if;

  insert into public.identity_claims(
    normalized_name,
    verification_hash,
    candidate_fingerprint,
    candidate_count,
    note
  ) values (
    v_normalized_name,
    p_verification_hash,
    p_candidate_fingerprint,
    v_candidate_count,
    p_note
  ) returning id into v_claim_id;

  insert into public.identity_claim_candidates(claim_id, player_id)
  select v_claim_id,
    player.id
  from public.players player
  where player.public_id = any(p_player_public_ids);

  return v_claim_id;
end;
$$;

create or replace function public.merge_players_internal(
  p_target_player_public_id uuid,
  p_source_player_public_ids uuid[],
  p_performed_by text,
  p_reason text,
  p_identity_claim_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target record;
  v_source_player_ids bigint[];
  v_source_count integer;
  v_source_name_count integer;
  v_source_normalized_name text;
  v_claim_status public.identity_claim_status;
  v_claim_candidate_count integer;
  v_matching_claim_candidate_count integer;
  v_operation_id uuid;
begin
  if p_target_player_public_id is null
    or coalesce(array_length(p_source_player_public_ids, 1), 0) < 1
    or (
      select count(distinct value)
      from unnest(p_source_player_public_ids) as source_ids(value)
    ) <> array_length(p_source_player_public_ids, 1)
    or p_target_player_public_id = any(p_source_player_public_ids)
    or char_length(trim(coalesce(p_performed_by, ''))) not between 1 and 100
    or char_length(trim(coalesce(p_reason, ''))) not between 10 and 1000
  then
    raise exception 'invalid_player_merge';
  end if;

  perform player.id
  from public.players player
  where player.public_id = p_target_player_public_id
    or player.public_id = any(p_source_player_public_ids)
  order by player.id
  for update;

  select player.id,
    player.normalized_name,
    player.identity_status,
    player.merged_into_player_id
  into v_target
  from public.players player
  where player.public_id = p_target_player_public_id;

  if not found or v_target.merged_into_player_id is not null then
    raise exception 'player_merge_target_unavailable';
  end if;

  select array_agg(player.id order by player.id),
    count(*),
    count(distinct player.normalized_name),
    min(player.normalized_name)
  into v_source_player_ids,
    v_source_count,
    v_source_name_count,
    v_source_normalized_name
  from public.players player
  where player.public_id = any(p_source_player_public_ids)
    and player.merged_into_player_id is null;

  if v_source_count <> array_length(p_source_player_public_ids, 1)
    or v_source_name_count <> 1
    or v_source_normalized_name is distinct from v_target.normalized_name
  then
    raise exception 'player_merge_candidates_mismatch';
  end if;

  if exists (
    select 1
    from unnest(v_source_player_ids) as source_players(player_id)
    where not exists (
      select 1
      from public.source_player_identities identity
      where identity.player_id = source_players.player_id
    )
  ) then
    raise exception 'player_merge_source_has_no_identity';
  end if;

  if p_identity_claim_id is not null then
    select claim.status
    into v_claim_status
    from public.identity_claims claim
    where claim.id = p_identity_claim_id;

    select count(*)
    into v_claim_candidate_count
    from public.identity_claim_candidates candidate
    where candidate.claim_id = p_identity_claim_id;

    select count(*)
    into v_matching_claim_candidate_count
    from public.identity_claim_candidates candidate
    where candidate.claim_id = p_identity_claim_id
      and candidate.player_id = any(array_append(v_source_player_ids, v_target.id));

    if v_claim_status is distinct from 'approved'
      or v_claim_candidate_count <> v_source_count + 1
      or v_matching_claim_candidate_count <> v_source_count + 1
    then
      raise exception 'player_merge_claim_mismatch';
    end if;
  end if;

  insert into public.identity_merge_operations(
    target_player_id,
    target_previous_identity_status,
    identity_claim_id,
    performed_by,
    reason
  ) values (
    v_target.id,
    v_target.identity_status,
    p_identity_claim_id,
    trim(p_performed_by),
    trim(p_reason)
  ) returning id into v_operation_id;

  insert into public.identity_merge_operation_players(
    operation_id,
    source_player_id,
    previous_identity_status
  )
  select v_operation_id,
    player.id,
    player.identity_status
  from public.players player
  where player.id = any(v_source_player_ids);

  insert into public.identity_merge_operation_identities(
    operation_id,
    source_player_identity_id,
    previous_player_id,
    merged_player_id,
    previous_match_status
  )
  select v_operation_id,
    identity.id,
    identity.player_id,
    v_target.id,
    identity.match_status
  from public.source_player_identities identity
  where identity.player_id = any(v_source_player_ids);

  update public.source_player_identities identity
  set player_id = v_target.id,
    match_status = 'linked',
    updated_at = now()
  where identity.player_id = any(v_source_player_ids);

  update public.players player
  set merged_into_player_id = v_target.id,
    merged_at = now(),
    updated_at = now()
  where player.id = any(v_source_player_ids);

  update public.players
  set identity_status = 'verified',
    updated_at = now()
  where id = v_target.id;

  return v_operation_id;
end;
$$;

create table public.identity_community_request_budgets (
  scope text not null check (scope in ('global', 'origin', 'editor')),
  identity_hash text not null check (
    identity_hash = 'global' or identity_hash ~ '^[0-9a-f]{64}$'
  ),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  last_requested_at timestamptz not null default now(),
  primary key (scope, identity_hash)
);

alter table public.identity_community_request_budgets enable row level security;

revoke all on public.identity_community_request_budgets
from public, anon, authenticated;

create or replace function public.claim_identity_global_request_internal()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget public.identity_community_request_budgets%rowtype;
begin
  insert into public.identity_community_request_budgets(scope, identity_hash)
  values ('global', 'global')
  on conflict do nothing;

  select budget.*
  into v_budget
  from public.identity_community_request_budgets budget
  where budget.scope = 'global'
    and budget.identity_hash = 'global'
  for update;

  if v_budget.window_started_at > now() - interval '10 minutes'
    and v_budget.request_count >= 30
  then
    raise exception 'identity_community_rate_limited';
  end if;

  update public.identity_community_request_budgets budget
  set request_count = case
        when budget.window_started_at <= now() - interval '10 minutes' then 1
        else budget.request_count + 1
      end,
      window_started_at = case
        when budget.window_started_at <= now() - interval '10 minutes' then now()
        else budget.window_started_at
      end,
      last_requested_at = now()
  where budget.scope = 'global'
    and budget.identity_hash = 'global';
end;
$$;

revoke all on function public.claim_identity_global_request_internal()
from public, anon, authenticated;

create or replace function public.apply_identity_edit_internal(
  p_player_public_ids uuid[],
  p_verification_hash text,
  p_candidate_fingerprint text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_count integer;
  v_name_count integer;
  v_normalized_name text;
  v_claim_id uuid;
  v_operation_id uuid;
  v_target_player_public_id uuid;
  v_source_player_public_ids uuid[];
  v_recent_count integer;
  v_actor text;
  v_reason text;
begin
  if coalesce(array_length(p_player_public_ids, 1), 0) < 2
    or (
      select count(distinct value)
      from unnest(p_player_public_ids) as ids(value)
    ) <> array_length(p_player_public_ids, 1)
    or p_verification_hash !~ '^[0-9a-f]{64}$'
    or p_candidate_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_reason is not null and char_length(p_reason) not between 10 and 500)
  then
    raise exception 'invalid_identity_edit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('identity-fingerprint:' || p_candidate_fingerprint, 0)
  );

  select operation.id,
    claim.id,
    target.public_id
  into v_operation_id,
    v_claim_id,
    v_target_player_public_id
  from public.identity_claims claim
  join public.identity_merge_operations operation
    on operation.identity_claim_id = claim.id
  join public.players target on target.id = operation.target_player_id
  where claim.verification_hash = p_verification_hash
    and claim.candidate_fingerprint = p_candidate_fingerprint
    and operation.status = 'applied'
  order by operation.created_at desc
  limit 1;

  if v_operation_id is not null then
    return jsonb_build_object(
      'claim_id', v_claim_id,
      'operation_id', v_operation_id,
      'target_player_public_id', v_target_player_public_id
    );
  end if;

  select count(*),
    count(distinct player.normalized_name),
    min(player.normalized_name)
  into v_candidate_count,
    v_name_count,
    v_normalized_name
  from public.players player
  where player.public_id = any(p_player_public_ids)
    and player.merged_into_player_id is null;

  if v_candidate_count <> array_length(p_player_public_ids, 1)
    or v_name_count <> 1
  then
    raise exception 'identity_edit_candidates_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('identity-name:' || v_normalized_name, 0)
  );

  select count(*),
    count(distinct player.normalized_name),
    min(player.normalized_name)
  into v_candidate_count,
    v_name_count,
    v_normalized_name
  from public.players player
  where player.public_id = any(p_player_public_ids)
    and player.merged_into_player_id is null;

  if v_candidate_count <> array_length(p_player_public_ids, 1)
    or v_name_count <> 1
  then
    raise exception 'identity_edit_candidates_mismatch';
  end if;

  select claim.id
  into v_claim_id
  from public.identity_claims claim
  where claim.verification_hash = p_verification_hash
    and claim.candidate_fingerprint = p_candidate_fingerprint
    and claim.status in ('pending', 'approved')
    and claim.created_at >= now() - interval '24 hours'
    and not exists (
      select 1
      from public.identity_merge_operations operation
      where operation.identity_claim_id = claim.id
    )
  order by claim.created_at desc
  limit 1
  for update;

  if v_claim_id is null then
    select count(*)
    into v_recent_count
    from public.identity_claims claim
    where claim.verification_hash = p_verification_hash
      and claim.normalized_name = v_normalized_name
      and claim.created_at >= now() - interval '24 hours';
    if v_recent_count >= 3 then
      raise exception 'identity_edit_rate_limited';
    end if;

    select count(*)
    into v_recent_count
    from public.identity_claims claim
    where claim.created_at >= now() - interval '10 minutes';
    if v_recent_count >= 30 then
      raise exception 'identity_edit_rate_limited';
    end if;

    insert into public.identity_claims(
      normalized_name,
      verification_hash,
      candidate_fingerprint,
      candidate_count,
      note
    ) values (
      v_normalized_name,
      p_verification_hash,
      p_candidate_fingerprint,
      v_candidate_count,
      p_reason
    ) returning id into v_claim_id;

    insert into public.identity_claim_candidates(claim_id, player_id)
    select v_claim_id,
      player.id
    from public.players player
    where player.public_id = any(p_player_public_ids);
  end if;

  perform public.claim_identity_global_request_internal();

  select player.public_id
  into v_target_player_public_id
  from public.players player
  where player.public_id = any(p_player_public_ids)
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

  select array_agg(candidate_id order by candidate_id)
  into v_source_player_public_ids
  from unnest(p_player_public_ids) as candidates(candidate_id)
  where candidate_id <> v_target_player_public_id;

  v_actor := 'community:' || substring(p_verification_hash from 1 for 12);
  v_reason := coalesce(
    nullif(trim(p_reason), ''),
    '참여자가 같은 사람의 공개 기록으로 선택해 연결함'
  );

  update public.identity_claims
  set status = 'approved',
    reviewed_by = v_actor,
    review_note = '사용자 참여 편집으로 즉시 반영됨'
  where id = v_claim_id
    and status = 'pending';

  v_operation_id := public.merge_players_internal(
    v_target_player_public_id,
    v_source_player_public_ids,
    v_actor,
    v_reason,
    v_claim_id
  );

  return jsonb_build_object(
    'claim_id', v_claim_id,
    'operation_id', v_operation_id,
    'target_player_public_id', v_target_player_public_id
  );
end;
$$;

revoke all on function public.apply_identity_edit_internal(uuid[], text, text, text)
from public, anon, authenticated;
grant execute on function public.apply_identity_edit_internal(uuid[], text, text, text)
to service_role;

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
begin
  if p_operation_id is null
    or p_actor_hash !~ '^[0-9a-f]{64}$'
    or char_length(trim(coalesce(p_reason, ''))) not between 10 and 500
  then
    raise exception 'invalid_identity_edit_revert';
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

revoke all on function public.revert_identity_edit_community_internal(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.revert_identity_edit_community_internal(uuid, text, text)
to service_role;

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
  select operation.id operation_id,
    upper(substring(claim.id::text from 1 for 8)) reference_id,
    target.normalized_name,
    operation.status,
    target.public_id::text target_player_id,
    target.canonical_name target_player_name,
    operation.reason,
    operation.created_at,
    operation.reverted_at,
    operation.revert_reason,
    operation.status = 'applied'
      and not exists (
        select 1
        from public.identity_merge_operations later_operation
        where later_operation.target_player_id = operation.target_player_id
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
          'player_id', member.public_id,
          'name', member.canonical_name,
          'region', member.primary_region,
          'club', member.club_name
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
        left join public.clubs source_club on source_club.id = source.primary_club_id
        where item.operation_id = operation.id
      ) member
    ) candidates
  from public.identity_merge_operations operation
  join public.identity_claims claim on claim.id = operation.identity_claim_id
  join public.players target on target.id = operation.target_player_id
  left join public.clubs target_club on target_club.id = target.primary_club_id
  where target.normalized_name = p_normalized_name
    and char_length(p_normalized_name) between 1 and 100
    and operation.performed_by like 'community:%'
  order by operation.created_at desc, operation.id desc;
$$;

revoke all on function public.list_identity_edit_history(text) from public;
grant execute on function public.list_identity_edit_history(text) to anon, authenticated;

create or replace function public.list_identity_candidate_evidence(
  p_player_public_ids uuid[]
) returns table (
  id bigint,
  player_public_id uuid,
  tournament_name_text text,
  event_name text,
  event_type public.event_type,
  division_system text,
  division_value text,
  rank_text text,
  club_text text,
  source_url text,
  source_code text,
  source_name text,
  tournament_scale public.tournament_scale,
  tournament_date date,
  source_published_date date,
  sort_date date,
  last_checked_at timestamptz,
  first_seen_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select evidence.id,
    evidence.player_public_id,
    evidence.tournament_name_text,
    evidence.event_name,
    evidence.event_type,
    evidence.division_system,
    evidence.division_value,
    evidence.rank_text,
    evidence.club_text,
    evidence.source_url,
    evidence.source_code,
    evidence.source_name,
    evidence.tournament_scale,
    evidence.tournament_date,
    evidence.source_published_date,
    evidence.sort_date,
    evidence.last_checked_at,
    evidence.first_seen_at
  from (
    select result.*,
      row_number() over (
        partition by result.player_public_id
        order by result.sort_date desc nulls last,
          result.last_checked_at desc,
          result.id desc
      ) evidence_order
    from public.public_results result
    where cardinality(p_player_public_ids) between 1 and 100
      and result.player_public_id = any(p_player_public_ids)
  ) evidence
  where evidence.evidence_order <= 2
  order by evidence.player_public_id,
    evidence.sort_date desc nulls last,
    evidence.last_checked_at desc,
    evidence.id desc;
$$;

revoke all on function public.list_identity_candidate_evidence(uuid[]) from public;
grant execute on function public.list_identity_candidate_evidence(uuid[])
to anon, authenticated;

comment on table public.identity_merge_operations is
  'Reversible identity edits. Community actions retain every source player and result while moving identity links.';
comment on column public.identity_claims.verification_hash is
  'Server-only HMAC of a random browser-local anonymous editor ID. The raw ID is not stored and the hash is not an authentication credential.';
comment on function public.apply_identity_edit_internal(uuid[], text, text, text) is
  'Atomically applies an unlimited-size same-name community identity edit and records its reversible audit snapshot.';
comment on function public.list_identity_edit_history(text) is
  'Returns a public, privacy-filtered revision history for one normalized player name.';
comment on function public.list_identity_candidate_evidence(uuid[]) is
  'Returns the two latest public records for every requested identity candidate without a candidate-count cap.';

notify pgrst, 'reload schema';
