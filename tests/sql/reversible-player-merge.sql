begin;

do $$
declare
  v_source_id bigint;
  v_target_player_id bigint;
  v_source_player_id bigint;
  v_target_public_id uuid;
  v_source_public_id uuid;
  v_source_identity_id bigint;
  v_result_id bigint;
  v_operation_id uuid;
begin
  select id into v_source_id
  from public.sources
  where code = 'mock';

  insert into public.players(canonical_name, normalized_name, identity_status)
  values ('복구탁구', '복구탁구', 'unreviewed')
  returning id, public_id into v_target_player_id, v_target_public_id;

  insert into public.players(canonical_name, normalized_name, identity_status)
  values ('복구탁구', '복구탁구', 'likely')
  returning id, public_id into v_source_player_id, v_source_public_id;

  insert into public.source_player_identities(
    player_id,
    source_id,
    source_identity_key,
    source_name,
    normalized_source_name,
    source_url,
    first_seen_at,
    last_seen_at,
    last_checked_at,
    content_hash,
    match_status
  ) values (
    v_source_player_id,
    v_source_id,
    'reversible-merge-source',
    '복구탁구',
    '복구탁구',
    'https://example.com/reversible-merge-source',
    now(),
    now(),
    now(),
    'reversible-merge-identity-content',
    'candidate'
  ) returning id into v_source_identity_id;

  insert into public.results(
    source_id,
    source_player_identity_id,
    tournament_name_text,
    event_name,
    event_type,
    source_url,
    natural_key_hash,
    content_hash,
    first_seen_at,
    last_seen_at,
    last_checked_at
  ) values (
    v_source_id,
    v_source_identity_id,
    '복구 검증 탁구대회',
    '개인단식 5~7부',
    'singles',
    'https://example.com/reversible-merge-result',
    'reversible-merge-natural-key',
    'reversible-merge-result-content',
    now(),
    now(),
    now()
  ) returning id into v_result_id;

  v_operation_id := public.merge_players_internal(
    v_target_public_id,
    array[v_source_public_id],
    'migration-test',
    '합성 데이터로 되돌릴 수 있는 병합을 검증합니다'
  );

  if not exists (
    select 1
    from public.players
    where id = v_source_player_id
      and merged_into_player_id = v_target_player_id
  ) then
    raise exception 'source player was not marked as merged';
  end if;

  if not exists (
    select 1
    from public.source_player_identities
    where id = v_source_identity_id
      and player_id = v_target_player_id
      and match_status = 'linked'
  ) then
    raise exception 'source identity was not linked to the target';
  end if;

  if exists (
    select 1
    from public.public_player_search
    where id = v_source_public_id::text
  ) then
    raise exception 'merged source player remains visible in search';
  end if;

  if not exists (
    select 1
    from public.public_results
    where id = v_result_id
      and player_public_id = v_target_public_id
  ) then
    raise exception 'result did not follow the merged source identity';
  end if;

  perform public.revert_player_merge_internal(
    v_operation_id,
    'migration-test',
    '합성 데이터 병합을 원래 동명이인 후보로 복구합니다'
  );

  if not exists (
    select 1
    from public.players
    where id = v_source_player_id
      and merged_into_player_id is null
      and merged_at is null
      and identity_status = 'likely'
  ) then
    raise exception 'source player state was not restored';
  end if;

  if not exists (
    select 1
    from public.source_player_identities
    where id = v_source_identity_id
      and player_id = v_source_player_id
      and match_status = 'candidate'
  ) then
    raise exception 'source identity link was not restored';
  end if;

  if not exists (
    select 1
    from public.public_results
    where id = v_result_id
      and player_public_id = v_source_public_id
  ) then
    raise exception 'original result was not restored to the source player';
  end if;

  if not exists (
    select 1
    from public.identity_merge_operations
    where id = v_operation_id
      and status = 'reverted'
      and reverted_by = 'migration-test'
  ) then
    raise exception 'merge audit was not marked as reverted';
  end if;

  v_operation_id := public.merge_players_internal(
    v_target_public_id,
    array[v_source_public_id],
    'migration-test',
    '합성 데이터로 원복 충돌 감지를 검증합니다'
  );

  update public.source_player_identities
  set match_status = 'candidate'
  where id = v_source_identity_id;

  begin
    perform public.revert_player_merge_internal(
      v_operation_id,
      'migration-test',
      '병합 뒤 변경된 연결은 자동으로 덮어쓰지 않습니다'
    );
    raise exception 'expected player_merge_revert_conflict';
  exception
    when others then
      if sqlerrm <> 'player_merge_revert_conflict' then
        raise;
      end if;
  end;
end;
$$;

rollback;
