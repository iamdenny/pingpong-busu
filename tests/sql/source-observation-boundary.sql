begin;

update public.sources
set enabled = true
where code = 'mock';

do $$
declare
  first_summary jsonb;
  second_summary jsonb;
  test_player_id bigint;
begin
  first_summary := public.upsert_source_records(
    'mock',
    '홍경계',
    'issue14-query',
    jsonb_build_array(jsonb_build_object(
      'sourceIdentityKey', 'issue14-source-identity',
      'naturalKeyHash', 'issue14-natural-key',
      'contentHash', 'issue14-content-hash',
      'playerName', '홍경계',
      'normalizedPlayerName', '홍경계',
      'clubText', '82개판5분전',
      'tournamentName', '출처 경계 합성 대회',
      'tournamentDate', '2026-08-09',
      'eventName', '혼성 6부',
      'eventType', 'singles',
      'divisionSystem', 'integrated',
      'divisionValue', '6부',
      'rankText', '예선 12조 3위',
      'sourceUrl', 'https://example.invalid/issue-14'
    )),
    'mock-issue14'
  );

  select spi.player_id
  into test_player_id
  from public.source_player_identities spi
  join public.sources s on s.id = spi.source_id
  where s.code = 'mock'
    and spi.source_identity_key = 'issue14-source-identity';

  if (first_summary->>'inserted')::integer <> 1 then
    raise exception 'first source-boundary upsert did not insert exactly one result';
  end if;
  if exists (
    select 1 from public.players p where p.id = test_player_id and p.primary_club_id is not null
  ) then
    raise exception 'source affiliation was promoted to player.primary_club_id';
  end if;
  if exists (
    select 1 from public.clubs c where c.normalized_name = '82개판5분전'
  ) then
    raise exception 'source affiliation created a canonical club';
  end if;
  if not exists (
    select 1
    from public.source_player_identities spi
    where spi.player_id = test_player_id
      and spi.source_club_text = '82개판5분전'
  ) then
    raise exception 'source identity affiliation evidence was not preserved';
  end if;
  if not exists (
    select 1
    from public.results r
    join public.source_player_identities spi on spi.id = r.source_player_identity_id
    where spi.player_id = test_player_id
      and r.club_text = '82개판5분전'
      and r.rank_text = '예선 12조 3위'
  ) then
    raise exception 'result evidence was not preserved';
  end if;

  second_summary := public.upsert_source_records(
    'mock',
    '홍경계',
    'issue14-query',
    jsonb_build_array(jsonb_build_object(
      'sourceIdentityKey', 'issue14-source-identity',
      'naturalKeyHash', 'issue14-natural-key',
      'contentHash', 'issue14-content-hash',
      'playerName', '홍경계',
      'normalizedPlayerName', '홍경계',
      'clubText', '82개판5분전',
      'tournamentName', '출처 경계 합성 대회',
      'tournamentDate', '2026-08-09',
      'eventName', '혼성 6부',
      'eventType', 'singles',
      'divisionSystem', 'integrated',
      'divisionValue', '6부',
      'rankText', '예선 12조 3위',
      'sourceUrl', 'https://example.invalid/issue-14'
    )),
    'mock-issue14'
  );

  if (second_summary->>'unchanged')::integer <> 1 then
    raise exception 're-entry was not classified as unchanged';
  end if;
  if exists (
    select 1 from public.players p where p.id = test_player_id and p.primary_club_id is not null
  ) then
    raise exception 're-entry changed canonical affiliation';
  end if;
end;
$$;

do $$
declare
  item record;
begin
  for item in
    select *
    from (values
      (null::text, false),
      ('예선 12조 3위', false),
      ('조별 1위', false),
      ('본선 8강', false),
      ('준우승', true),
      ('공동 3위', true),
      ('본선 4강', true),
      ('본선 ４강', true)
    ) as cases(rank_text, expected)
  loop
    if public.is_award_rank(item.rank_text) is distinct from item.expected then
      raise exception 'unexpected award classification for %', item.rank_text;
    end if;
  end loop;
end;
$$;

rollback;
