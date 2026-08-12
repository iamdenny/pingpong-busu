alter table public.results
add column source_published_on date;

create index results_chronology_idx
on public.results(source_player_identity_id, source_published_on desc, last_checked_at desc);

drop view public.public_results;

create view public.public_results with (security_invoker = true) as
select r.*, s.code source_code, s.display_name source_name, p.public_id player_public_id,
  coalesce(t.scale, 'unknown'::public.tournament_scale) tournament_scale,
  t.held_on tournament_date,
  r.source_published_on source_published_date,
  coalesce(t.held_on, r.source_published_on) sort_date
from public.results r
join public.sources s on s.id = r.source_id
join public.source_player_identities spi on spi.id = r.source_player_identity_id
join public.players p on p.id = spi.player_id
left join public.tournaments t on t.id = r.tournament_id
where r.record_status <> 'disputed';

grant select on public.public_results to anon;

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
  v_source_published_on date;
begin
  v_summary := public.upsert_source_records(p_source_code, p_query_name, p_query_key, p_records, p_parser_version);
  select id into v_source_id from public.sources where code = p_source_code;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    v_source_published_on := nullif(v_record->>'sourcePublishedDate', '')::date;
    if v_source_published_on is not null then
      update public.results
      set source_published_on = v_source_published_on, updated_at = now()
      where source_id = v_source_id
        and natural_key_hash = v_record->>'naturalKeyHash'
        and source_published_on is distinct from v_source_published_on;
    end if;

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
