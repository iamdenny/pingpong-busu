-- Source-provided affiliations are evidence, not reviewed canonical clubs.
-- Keep the raw text on source identities and results, but never promote it
-- through the crawler write path.
create or replace function public.upsert_source_records(
  p_source_code text,
  p_query_name text,
  p_query_key text,
  p_records jsonb,
  p_parser_version text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id bigint;
  v_refresh_id bigint;
  v_record jsonb;
  v_player_id bigint;
  v_identity_id bigint;
  v_tournament_id bigint;
  v_result public.results%rowtype;
  v_previous jsonb;
  v_changed_fields text[];
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 200 then
    raise exception 'invalid_records';
  end if;
  select id into v_source_id from public.sources where code=p_source_code and enabled=true for update;
  if v_source_id is null then raise exception 'source_disabled'; end if;

  insert into public.source_refreshes(source_id,query_key,query_display,status,requested_at,started_at,records_found,parser_version,expires_at)
  values(v_source_id,p_query_key,p_query_name,'running',now(),now(),jsonb_array_length(p_records),p_parser_version,now()+interval '6 hours')
  returning id into v_refresh_id;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    if coalesce(v_record->>'sourceIdentityKey','')='' or coalesce(v_record->>'naturalKeyHash','')='' or coalesce(v_record->>'contentHash','')='' then
      raise exception 'invalid_record_hashes';
    end if;

    select id,player_id into v_identity_id,v_player_id from public.source_player_identities where source_id=v_source_id and source_identity_key=v_record->>'sourceIdentityKey';
    if v_identity_id is null then
      insert into public.players(canonical_name,normalized_name,primary_region,identity_status)
      values(v_record->>'playerName',v_record->>'normalizedPlayerName',nullif(v_record->>'region',''),'unreviewed') returning id into v_player_id;
      insert into public.source_player_identities(player_id,source_id,source_identity_key,source_name,normalized_source_name,source_club_text,source_region,source_url,first_seen_at,last_seen_at,last_checked_at,content_hash,match_status)
      values(v_player_id,v_source_id,v_record->>'sourceIdentityKey',v_record->>'playerName',v_record->>'normalizedPlayerName',nullif(v_record->>'clubText',''),nullif(v_record->>'region',''),v_record->>'sourceUrl',now(),now(),now(),v_record->>'sourceIdentityKey','linked')
      returning id into v_identity_id;
    else
      update public.source_player_identities set last_seen_at=now(),last_checked_at=now(),source_club_text=nullif(v_record->>'clubText',''),updated_at=now() where id=v_identity_id;
    end if;

    select id into v_tournament_id from public.tournaments where normalized_name=regexp_replace(lower(v_record->>'tournamentName'),'\s+','','g') and held_on is not distinct from nullif(v_record->>'tournamentDate','')::date limit 1;
    if v_tournament_id is null then
      insert into public.tournaments(canonical_name,normalized_name,held_on,scale)
      values(v_record->>'tournamentName',regexp_replace(lower(v_record->>'tournamentName'),'\s+','','g'),nullif(v_record->>'tournamentDate','')::date,case when v_record->>'tournamentName' like '%전국%' then 'national'::public.tournament_scale else 'unknown'::public.tournament_scale end)
      returning id into v_tournament_id;
    end if;

    select * into v_result from public.results where natural_key_hash=v_record->>'naturalKeyHash' for update;
    if not found then
      insert into public.results(source_id,source_player_identity_id,tournament_id,tournament_name_text,event_name,event_type,division_system,division_value,rank_text,club_text,partner_text,source_url,natural_key_hash,content_hash,first_seen_at,last_seen_at,last_checked_at,record_status)
      values(v_source_id,v_identity_id,v_tournament_id,v_record->>'tournamentName',v_record->>'eventName',coalesce(nullif(v_record->>'eventType',''),'unknown')::public.event_type,nullif(v_record->>'divisionSystem',''),nullif(v_record->>'divisionValue',''),nullif(v_record->>'rankText',''),nullif(v_record->>'clubText',''),nullif(v_record->>'partnerText',''),v_record->>'sourceUrl',v_record->>'naturalKeyHash',v_record->>'contentHash',now(),now(),now(),'active');
      v_inserted := v_inserted + 1;
    elsif v_result.content_hash = v_record->>'contentHash' then
      update public.results set last_seen_at=now(),last_checked_at=now(),updated_at=now() where id=v_result.id;
      v_unchanged := v_unchanged + 1;
    else
      v_previous := jsonb_build_object('clubText',v_result.club_text,'divisionSystem',v_result.division_system,'divisionValue',v_result.division_value,'rankText',v_result.rank_text,'partnerText',v_result.partner_text);
      select array_agg(field_name) into v_changed_fields from unnest(array['clubText','divisionSystem','divisionValue','rankText','partnerText']) field_name where coalesce(v_previous->>field_name,'') is distinct from coalesce(v_record->>field_name,'');
      insert into public.result_revisions(result_id,previous_data,next_data,changed_fields,source_refresh_id) values(v_result.id,v_previous,v_record,coalesce(v_changed_fields,array[]::text[]),v_refresh_id);
      update public.results set division_system=nullif(v_record->>'divisionSystem',''),division_value=nullif(v_record->>'divisionValue',''),rank_text=nullif(v_record->>'rankText',''),club_text=nullif(v_record->>'clubText',''),partner_text=nullif(v_record->>'partnerText',''),source_url=v_record->>'sourceUrl',content_hash=v_record->>'contentHash',last_seen_at=now(),last_checked_at=now(),record_status='corrected',updated_at=now() where id=v_result.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  update public.source_refreshes set status='succeeded',completed_at=now(),records_inserted=v_inserted,records_updated=v_updated,records_unchanged=v_unchanged where id=v_refresh_id;
  update public.sources set last_attempt_at=now(),last_success_at=now(),last_error_code=null,parser_version=p_parser_version,updated_at=now() where id=v_source_id;
  return jsonb_build_object('refreshId',v_refresh_id,'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,'found',jsonb_array_length(p_records));
end;
$$;

revoke all on function public.upsert_source_records(text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.upsert_source_records(text,text,text,jsonb,text) to service_role;

comment on function public.upsert_source_records(text,text,text,jsonb,text) is
  'Stores source affiliations as observations without promoting them to reviewed canonical clubs.';

-- Preliminary-stage placements are participation evidence, even when their
-- labels contain otherwise award-like text such as "3위".
create or replace function public.is_award_rank(p_rank_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rank_text is null then false
    when regexp_replace(normalize(p_rank_text, NFKC), '[[:space:]]+', '', 'g') ~ '(예선|조별)' then false
    else
      position('우승' in regexp_replace(normalize(p_rank_text, NFKC), '[[:space:]]+', '', 'g')) > 0
      or regexp_replace(normalize(p_rank_text, NFKC), '[[:space:]]+', '', 'g') ~ '(^|[^0-9])[123]위([^0-9]|$)'
      or regexp_replace(normalize(p_rank_text, NFKC), '[[:space:]]+', '', 'g') ~ '(^|[^0-9])(2|4)강([^0-9]|$)'
  end;
$$;

comment on function public.is_award_rank(text) is
  'Returns true only for semifinal (4강), final (2강), or better non-preliminary public result labels.';

-- Remove the one known canonical link created by the old crawler behavior.
-- Raw Airping source identities, results, and revisions remain untouched.
do $$
declare
  v_contaminated_club_id bigint;
begin
  update public.players p
  set primary_club_id = null,
      updated_at = now()
  from public.clubs c
  where c.id = p.primary_club_id
    and p.public_id = 'f66a6821-83a4-4fda-ac5f-7484b8f6bdad'::uuid
    and p.identity_status = 'unreviewed'
    and c.canonical_name = '82개판5분전'
    and c.normalized_name = regexp_replace(lower('82개판5분전'), '[[:space:]]+', '', 'g')
    and exists (
      select 1
      from public.source_player_identities spi
      join public.sources s on s.id = spi.source_id
      where spi.player_id = p.id
        and s.code = 'airping'
        and spi.source_club_text = '82개판5분전'
    )
  returning c.id into v_contaminated_club_id;

  if v_contaminated_club_id is not null then
    delete from public.clubs c
    where c.id = v_contaminated_club_id
      and not exists (
        select 1
        from public.players p
        where p.primary_club_id = c.id
      )
      and not exists (
        select 1
        from public.club_aliases ca
        where ca.club_id = c.id
      );
  end if;
end;
$$;
