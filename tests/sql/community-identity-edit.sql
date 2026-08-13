begin;

do $$
declare
  v_source_id bigint;
  v_player_id bigint;
  v_player_public_id uuid;
  v_player_public_ids uuid[] := array[]::uuid[];
  v_edit jsonb;
  v_operation_id uuid;
  v_index integer;
begin
  select source.id
  into v_source_id
  from public.sources source
  where source.code = 'mock';

  for v_index in 1..12 loop
    insert into public.players(
      canonical_name,
      normalized_name,
      primary_region,
      identity_status
    ) values (
      '참여탁구',
      '참여탁구',
      case when v_index % 2 = 0 then '서울' else '경기' end,
      'unreviewed'
    ) returning id, public_id into v_player_id, v_player_public_id;

    v_player_public_ids := array_append(
      v_player_public_ids,
      v_player_public_id
    );

    insert into public.source_player_identities(
      player_id,
      source_id,
      source_identity_key,
      source_name,
      normalized_source_name,
      source_region,
      source_url,
      first_seen_at,
      last_seen_at,
      last_checked_at,
      content_hash,
      match_status
    ) values (
      v_player_id,
      v_source_id,
      'community-edit-source-' || v_index,
      '참여탁구',
      '참여탁구',
      case when v_index % 2 = 0 then '서울' else '경기' end,
      'https://example.com/community-edit/' || v_index,
      now(),
      now(),
      now(),
      'community-edit-identity-' || v_index,
      'candidate'
    );

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
    )
    select v_source_id,
      identity.id,
      '제' || v_index || '회 참여 편집 검증 대회',
      '개인단식 5부',
      'singles',
      'https://example.com/community-edit/result/' || v_index,
      'community-edit-natural-' || v_index,
      'community-edit-result-' || v_index,
      now(),
      now(),
      now()
    from public.source_player_identities identity
    where identity.player_id = v_player_id
      and identity.source_id = v_source_id;
  end loop;

  if (
    select count(*)
    from public.list_identity_candidate_evidence(v_player_public_ids)
  ) <> 12 then
    raise exception 'unlimited candidate evidence did not return every candidate';
  end if;

  update public.players
  set homonym_nickname = '루프 드라이브 최강자'
  where public_id = v_player_public_ids[1];

  update public.players
  set homonym_nickname = '파워 드라이브 전문가'
  where public_id = v_player_public_ids[7];

  v_edit := public.apply_identity_partition_internal(
    jsonb_build_array(
      jsonb_build_object(
        'nickname',
        '파워 드라이브 전문가',
        'player_public_ids',
        to_jsonb(v_player_public_ids[1:6])
      ),
      jsonb_build_object(
        'nickname',
        '루프 드라이브 최강자',
        'player_public_ids',
        to_jsonb(v_player_public_ids[7:12])
      )
    ),
    repeat('a', 64),
    repeat('b', 64),
    '열두 개 공개 대회 기록을 서로 다른 두 사람으로 구분했습니다'
  );
  v_operation_id := (v_edit->>'partition_id')::uuid;

  if (
    select count(*)
    from public.players player
    where player.public_id = any(v_player_public_ids)
      and player.merged_into_player_id is null
  ) <> 2 then
    raise exception 'community partition did not retain two nickname groups';
  end if;

  if (
    select count(distinct player.homonym_nickname)
    from public.players player
    where player.public_id = any(v_player_public_ids)
      and player.merged_into_player_id is null
      and player.homonym_nickname in (
        '파워 드라이브 전문가',
        '루프 드라이브 최강자'
      )
  ) <> 2 then
    raise exception 'community partition did not apply both nicknames';
  end if;

  if not exists (
    select 1
    from public.list_identity_edit_history('참여탁구') history
    where history.operation_id = v_operation_id
      and history.status = 'applied'
      and history.can_revert
      and jsonb_array_length(history.candidates) = 12
      and (
        select count(distinct candidate->>'group_nickname')
        from jsonb_array_elements(history.candidates) candidate
      ) = 2
  ) then
    raise exception 'public community partition history is incomplete';
  end if;

  perform public.revert_identity_edit_community_internal(
    v_operation_id,
    repeat('c', 64),
    '서로 다른 동명이인 기록이 포함된 것을 확인해 다시 분리합니다'
  );

  if (
    select count(*)
    from public.players player
    where player.public_id = any(v_player_public_ids)
      and player.merged_into_player_id is null
  ) <> 12 then
    raise exception 'community partition revert did not restore every candidate';
  end if;

  if not exists (
    select 1
    from public.players player
    where player.public_id = v_player_public_ids[1]
      and player.homonym_nickname = '루프 드라이브 최강자'
  ) or not exists (
    select 1
    from public.players player
    where player.public_id = v_player_public_ids[7]
      and player.homonym_nickname = '파워 드라이브 전문가'
  ) or (
    select count(*)
    from public.players player
    where player.public_id = any(v_player_public_ids)
      and player.homonym_nickname is not null
  ) <> 2 then
    raise exception 'community partition revert did not restore previous nicknames';
  end if;

  if not exists (
    select 1
    from public.list_identity_edit_history('참여탁구') history
    where history.operation_id = v_operation_id
      and history.status = 'reverted'
      and history.revert_reason =
        '서로 다른 동명이인 기록이 포함된 것을 확인해 다시 분리합니다'
  ) then
    raise exception 'community revert history is incomplete';
  end if;
end;
$$;

rollback;
