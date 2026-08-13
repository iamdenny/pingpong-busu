alter table public.players
add column merged_into_player_id bigint references public.players(id) on delete restrict,
add column merged_at timestamptz,
add constraint players_not_merged_into_self
  check (merged_into_player_id is null or merged_into_player_id <> id),
add constraint players_merge_timestamp_consistency
  check (
    (merged_into_player_id is null and merged_at is null)
    or (merged_into_player_id is not null and merged_at is not null)
  );

create index players_merged_into_idx
on public.players(merged_into_player_id)
where merged_into_player_id is not null;

create table public.identity_merge_operations (
  id uuid primary key default gen_random_uuid(),
  target_player_id bigint not null references public.players(id) on delete restrict,
  target_previous_identity_status public.identity_status not null,
  identity_claim_id uuid references public.identity_claims(id) on delete restrict,
  status text not null default 'applied' check (status in ('applied', 'reverted')),
  performed_by text not null check (char_length(performed_by) between 1 and 100),
  reason text not null check (char_length(reason) between 10 and 1000),
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by text check (reverted_by is null or char_length(reverted_by) between 1 and 100),
  revert_reason text check (revert_reason is null or char_length(revert_reason) between 10 and 1000),
  check (
    (status = 'applied' and reverted_at is null and reverted_by is null and revert_reason is null)
    or
    (status = 'reverted' and reverted_at is not null and reverted_by is not null and revert_reason is not null)
  )
);

create index identity_merge_operations_target_idx
on public.identity_merge_operations(target_player_id, created_at desc);

create table public.identity_merge_operation_players (
  operation_id uuid not null references public.identity_merge_operations(id) on delete restrict,
  source_player_id bigint not null references public.players(id) on delete restrict,
  previous_identity_status public.identity_status not null,
  primary key (operation_id, source_player_id)
);

create table public.identity_merge_operation_identities (
  operation_id uuid not null references public.identity_merge_operations(id) on delete restrict,
  source_player_identity_id bigint not null references public.source_player_identities(id) on delete restrict,
  previous_player_id bigint not null references public.players(id) on delete restrict,
  merged_player_id bigint not null references public.players(id) on delete restrict,
  previous_match_status public.match_status not null,
  primary key (operation_id, source_player_identity_id)
);

create index identity_merge_operation_identities_previous_player_idx
on public.identity_merge_operation_identities(previous_player_id);

alter table public.identity_merge_operations enable row level security;
alter table public.identity_merge_operation_players enable row level security;
alter table public.identity_merge_operation_identities enable row level security;

revoke all on public.identity_merge_operations,
  public.identity_merge_operation_players,
  public.identity_merge_operation_identities
from public, anon, authenticated;

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
    or coalesce(array_length(p_source_player_public_ids, 1), 0) not between 1 and 10
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

create or replace function public.revert_player_merge_internal(
  p_operation_id uuid,
  p_reverted_by text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation record;
begin
  if p_operation_id is null
    or char_length(trim(coalesce(p_reverted_by, ''))) not between 1 and 100
    or char_length(trim(coalesce(p_reason, ''))) not between 10 and 1000
  then
    raise exception 'invalid_player_merge_revert';
  end if;

  select operation.*
  into v_operation
  from public.identity_merge_operations operation
  where operation.id = p_operation_id
  for update;

  if not found or v_operation.status <> 'applied' then
    raise exception 'player_merge_not_revertible';
  end if;

  if exists (
    select 1
    from public.identity_merge_operations later_operation
    where later_operation.target_player_id = v_operation.target_player_id
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

  perform player.id
  from public.players player
  where player.id = v_operation.target_player_id
    or exists (
      select 1
      from public.identity_merge_operation_players item
      where item.operation_id = v_operation.id
        and item.source_player_id = player.id
    )
  order by player.id
  for update;

  perform identity.id
  from public.source_player_identities identity
  join public.identity_merge_operation_identities item
    on item.source_player_identity_id = identity.id
  where item.operation_id = v_operation.id
  order by identity.id
  for update;

  if exists (
    select 1
    from public.identity_merge_operation_identities item
    join public.source_player_identities identity
      on identity.id = item.source_player_identity_id
    where item.operation_id = v_operation.id
      and (
        identity.player_id is distinct from item.merged_player_id
        or identity.match_status is distinct from 'linked'
      )
  ) then
    raise exception 'player_merge_revert_conflict';
  end if;

  if exists (
    select 1
    from public.identity_merge_operation_players item
    join public.players player on player.id = item.source_player_id
    where item.operation_id = v_operation.id
      and (
        player.merged_into_player_id is distinct from v_operation.target_player_id
        or player.identity_status is distinct from item.previous_identity_status
      )
  ) then
    raise exception 'player_merge_revert_conflict';
  end if;

  if not exists (
    select 1
    from public.players target
    where target.id = v_operation.target_player_id
      and target.merged_into_player_id is null
      and target.identity_status = 'verified'
  ) then
    raise exception 'player_merge_revert_conflict';
  end if;

  update public.source_player_identities identity
  set player_id = item.previous_player_id,
    match_status = item.previous_match_status,
    updated_at = now()
  from public.identity_merge_operation_identities item
  where item.operation_id = v_operation.id
    and identity.id = item.source_player_identity_id;

  update public.players player
  set merged_into_player_id = null,
    merged_at = null,
    identity_status = item.previous_identity_status,
    updated_at = now()
  from public.identity_merge_operation_players item
  where item.operation_id = v_operation.id
    and player.id = item.source_player_id;

  update public.players
  set identity_status = v_operation.target_previous_identity_status,
    updated_at = now()
  where id = v_operation.target_player_id;

  update public.identity_merge_operations
  set status = 'reverted',
    reverted_at = now(),
    reverted_by = trim(p_reverted_by),
    revert_reason = trim(p_reason)
  where id = v_operation.id;

  return v_operation.id;
end;
$$;

revoke all on function public.merge_players_internal(uuid, uuid[], text, text, uuid)
from public, anon, authenticated;
revoke all on function public.revert_player_merge_internal(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.merge_players_internal(uuid, uuid[], text, text, uuid)
to service_role;
grant execute on function public.revert_player_merge_internal(uuid, text, text)
to service_role;

create or replace view public.player_merge_review_log with (security_invoker = true) as
select operation.id,
  target.public_id target_player_public_id,
  target.canonical_name target_player_name,
  operation.identity_claim_id,
  operation.status,
  operation.performed_by,
  operation.reason,
  operation.created_at,
  operation.reverted_at,
  operation.reverted_by,
  operation.revert_reason,
  jsonb_agg(
    jsonb_build_object(
      'player_public_id', source.public_id,
      'name', source.canonical_name,
      'region', source.primary_region,
      'previous_identity_status', item.previous_identity_status
    ) order by source.public_id
  ) source_players
from public.identity_merge_operations operation
join public.players target on target.id = operation.target_player_id
join public.identity_merge_operation_players item on item.operation_id = operation.id
join public.players source on source.id = item.source_player_id
group by operation.id, target.id;

revoke all on public.player_merge_review_log from public, anon, authenticated;
grant select on public.player_merge_review_log to service_role;

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
where p.merged_into_player_id is null
group by p.id, c.canonical_name;

comment on table public.identity_merge_operations is
  'Admin-only reversible player merge audit. Source identities are reassigned without deleting players or results.';
comment on function public.revert_player_merge_internal(uuid, text, text) is
  'Restores the exact source-player identity links captured by a merge when no later conflicting merge exists.';

notify pgrst, 'reload schema';
