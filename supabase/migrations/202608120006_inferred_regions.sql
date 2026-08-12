create or replace function public.upsert_source_records_with_regions(
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
  v_summary jsonb;
  v_source_id bigint;
  v_record jsonb;
  v_region text;
begin
  v_summary := public.upsert_source_records(p_source_code, p_query_name, p_query_key, p_records, p_parser_version);
  select id into v_source_id from public.sources where code = p_source_code;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    v_region := nullif(v_record->>'region', '');
    if v_region is null then continue; end if;

    update public.source_player_identities
    set source_region = coalesce(source_region, v_region), updated_at = now()
    where source_id = v_source_id
      and source_identity_key = v_record->>'sourceIdentityKey';

    update public.players p
    set primary_region = coalesce(p.primary_region, v_region), updated_at = now()
    from public.source_player_identities spi
    where spi.player_id = p.id
      and spi.source_id = v_source_id
      and spi.source_identity_key = v_record->>'sourceIdentityKey';

    update public.tournaments
    set region = coalesce(region, v_region), updated_at = now()
    where normalized_name = regexp_replace(lower(v_record->>'tournamentName'), '\s+', '', 'g')
      and held_on is not distinct from nullif(v_record->>'tournamentDate', '')::date;
  end loop;

  return v_summary;
end;
$$;

revoke all on function public.upsert_source_records_with_regions(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.upsert_source_records_with_regions(text, text, text, jsonb, text) to service_role;

with region_aliases(alias, region) as (
  values
    ('인천광역시중구', '인천광역시 중구'),
    ('용인특례시', '경기도 용인시'), ('용인시', '경기도 용인시'),
    ('화성특례시', '경기도 화성시'), ('화성시', '경기도 화성시'),
    ('수원특례시', '경기도 수원시'), ('수원시', '경기도 수원시'),
    ('여주', '경기도 여주시'), ('김포', '경기도 김포시'),
    ('안동', '경상북도 안동시'), ('영주', '경상북도 영주시'),
    ('정선', '강원특별자치도 정선군'),
    ('서울특별시', '서울특별시'), ('서울시', '서울특별시'),
    ('부산광역시', '부산광역시'), ('대구광역시', '대구광역시'),
    ('인천광역시', '인천광역시'), ('광주광역시', '광주광역시'),
    ('대전광역시', '대전광역시'), ('울산광역시', '울산광역시'),
    ('세종특별자치시', '세종특별자치시'),
    ('경기도', '경기도'), ('강원특별자치도', '강원특별자치도'), ('강원도', '강원특별자치도'),
    ('충청북도', '충청북도'), ('충청남도', '충청남도'),
    ('전북특별자치도', '전북특별자치도'), ('전라북도', '전북특별자치도'),
    ('전라남도', '전라남도'), ('경상북도', '경상북도'), ('경상남도', '경상남도'),
    ('제주특별자치도', '제주특별자치도'), ('제주도', '제주특별자치도')
), inferred as (
  select t.id, (array_agg(a.region order by length(a.alias) desc))[1] as region
  from public.tournaments t
  join region_aliases a on regexp_replace(t.canonical_name, '\s+', '', 'g') like '%' || a.alias || '%'
  where t.region is null
  group by t.id
)
update public.tournaments t
set region = inferred.region, updated_at = now()
from inferred
where t.id = inferred.id;

with latest_identity_region as (
  select distinct on (spi.id) spi.id, t.region
  from public.source_player_identities spi
  join public.results r on r.source_player_identity_id = spi.id
  join public.tournaments t on t.id = r.tournament_id
  where spi.source_region is null and t.region is not null
  order by spi.id, t.held_on desc nulls last, r.last_checked_at desc, r.id desc
)
update public.source_player_identities spi
set source_region = inferred.region, updated_at = now()
from latest_identity_region inferred
where spi.id = inferred.id;

with latest_player_region as (
  select distinct on (p.id) p.id, spi.source_region
  from public.players p
  join public.source_player_identities spi on spi.player_id = p.id
  where p.primary_region is null and spi.source_region is not null
  order by p.id, spi.last_checked_at desc, spi.id desc
)
update public.players p
set primary_region = inferred.source_region, updated_at = now()
from latest_player_region inferred
where p.id = inferred.id;
