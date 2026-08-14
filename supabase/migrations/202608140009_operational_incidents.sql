create table public.operational_incidents (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  category text not null check (category = any (array[
    'source_schema_changed', 'source_auth_failed',
    'render_error', 'uncaught_error', 'unhandled_rejection'
  ])),
  source_code text,
  route text,
  app_version text not null,
  parser_version text,
  occurrence_count bigint not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  publication_status text not null default 'pending' check (publication_status = any (array['pending', 'delivering', 'delivery_unknown', 'failed', 'published'])),
  delivery_token uuid,
  delivery_lease_until timestamptz,
  issue_number bigint,
  issue_url text,
  last_delivery_error text
);

create table public.operational_incident_events (
  event_id uuid primary key,
  fingerprint text not null references public.operational_incidents(fingerprint) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.operational_incident_publication_budgets (
  scope text not null check (scope = any (array['browser', 'source'])),
  window_started_at timestamptz not null,
  publication_count integer not null check (publication_count between 0 and 5),
  primary key (scope, window_started_at)
);

create table public.operational_incident_ingestion_budgets (
  scope text not null check (scope = any (array['browser', 'source'])),
  window_started_at timestamptz not null,
  event_count integer not null check (event_count between 1 and 300),
  primary key (scope, window_started_at)
);

alter table public.operational_incidents enable row level security;
alter table public.operational_incident_events enable row level security;
alter table public.operational_incident_publication_budgets enable row level security;
alter table public.operational_incident_ingestion_budgets enable row level security;
revoke all on table public.operational_incidents from public, anon, authenticated;
revoke all on table public.operational_incident_events from public, anon, authenticated;
revoke all on table public.operational_incident_publication_budgets from public, anon, authenticated;
revoke all on table public.operational_incident_ingestion_budgets from public, anon, authenticated;
grant select, insert, update, delete on table public.operational_incidents to service_role;
grant select, insert, delete on table public.operational_incident_events to service_role;
grant select, insert, update, delete on table public.operational_incident_publication_budgets to service_role;
grant select, insert, update, delete on table public.operational_incident_ingestion_budgets to service_role;

create or replace function public.reserve_operational_incident_internal(
  p_fingerprint text,
  p_event_id uuid,
  p_category text,
  p_source_code text,
  p_route text,
  p_app_version text,
  p_parser_version text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_incident public.operational_incidents;
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
  v_event_count integer;
  v_scope text := case when p_category like 'source_%' then 'source' else 'browser' end;
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_category <> all (array['source_schema_changed','source_auth_failed','render_error','uncaught_error','unhandled_rejection'])
    or length(p_app_version) not between 1 and 32
    or (p_source_code is not null and p_source_code !~ '^[a-z0-9_-]{1,32}$')
    or (p_route is not null and p_route <> all (array['/','/search','/players/:id','/unknown']))
    or (p_parser_version is not null and (length(p_parser_version) < 1 or length(p_parser_version) > 32))
    or ((p_category like 'source_%') <> (p_source_code is not null and p_parser_version is not null))
  then raise exception 'invalid_operational_incident'; end if;

  if exists(select 1 from public.operational_incident_events where event_id = p_event_id) then
    select * into v_incident from public.operational_incidents where fingerprint = p_fingerprint;
    return jsonb_build_object('fingerprint', v_incident.fingerprint, 'occurrence_count', v_incident.occurrence_count, 'publication_status', v_incident.publication_status, 'issue_number', v_incident.issue_number, 'issue_url', v_incident.issue_url);
  end if;
  insert into public.operational_incident_ingestion_budgets(scope, window_started_at, event_count)
  values (v_scope, v_window, 1)
  on conflict (scope, window_started_at) do update
    set event_count = public.operational_incident_ingestion_budgets.event_count + 1
    where public.operational_incident_ingestion_budgets.event_count < 300
  returning event_count into v_event_count;
  if v_event_count is null then raise exception 'operational_incident_rate_limited'; end if;
  insert into public.operational_incidents(fingerprint, category, source_code, route, app_version, parser_version)
  values (p_fingerprint, p_category, p_source_code, p_route, p_app_version, p_parser_version)
  on conflict (fingerprint) do update set
    occurrence_count = public.operational_incidents.occurrence_count + 1,
    last_seen_at = now()
  where public.operational_incidents.category = excluded.category
    and public.operational_incidents.source_code is not distinct from excluded.source_code
    and public.operational_incidents.route is not distinct from excluded.route
    and public.operational_incidents.parser_version is not distinct from excluded.parser_version
  returning * into v_incident;
  if v_incident is null then raise exception 'operational_incident_conflict'; end if;
  insert into public.operational_incident_events(event_id, fingerprint) values (p_event_id, p_fingerprint);
  return jsonb_build_object('fingerprint', v_incident.fingerprint, 'occurrence_count', v_incident.occurrence_count, 'publication_status', v_incident.publication_status, 'issue_number', v_incident.issue_number, 'issue_url', v_incident.issue_url);
end $$;

create or replace function public.claim_operational_incident_delivery_internal(p_fingerprint text, p_delivery_token uuid, p_lease_seconds integer default 60)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_incident public.operational_incidents; v_previous text; v_window timestamptz := date_trunc('hour', now()); v_budget integer; v_scope text;
begin
  select * into v_incident from public.operational_incidents where fingerprint = p_fingerprint for update;
  if not found then raise exception 'operational_incident_not_found'; end if;
  if v_incident.publication_status = 'published' then return jsonb_build_object('status','published','claimed',false,'issue_number',v_incident.issue_number,'issue_url',v_incident.issue_url); end if;
  if v_incident.occurrence_count < 3 then return jsonb_build_object('status','pending','claimed',false); end if;
  if v_incident.publication_status = 'delivering' and v_incident.delivery_lease_until > now() then return jsonb_build_object('status','delivering','claimed',false); end if;
  v_previous := v_incident.publication_status;
  v_scope := case when v_incident.category like 'source_%' then 'source' else 'browser' end;
  insert into public.operational_incident_publication_budgets(scope, window_started_at, publication_count)
    values(v_scope, v_window, 0) on conflict do nothing;
  select publication_count into v_budget from public.operational_incident_publication_budgets where scope=v_scope and window_started_at=v_window for update;
  if v_budget >= 5 then return jsonb_build_object('status','pending','claimed',false); end if;
  update public.operational_incident_publication_budgets set publication_count=publication_count+1 where scope=v_scope and window_started_at=v_window;
  update public.operational_incidents set publication_status='delivering', delivery_token=p_delivery_token,
    delivery_lease_until=now() + least(greatest(p_lease_seconds, 10), 300) * interval '1 second'
    where fingerprint=p_fingerprint;
  return jsonb_build_object('status','delivering','claimed',true,'previous_status',v_previous);
end $$;

create or replace function public.finalize_operational_incident_delivery_internal(p_fingerprint text, p_delivery_token uuid, p_issue_number bigint, p_issue_url text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.operational_incidents set publication_status='published', issue_number=p_issue_number, issue_url=p_issue_url,
    delivery_token=null, delivery_lease_until=null, last_delivery_error=null
  where fingerprint=p_fingerprint and delivery_token=p_delivery_token and publication_status='delivering';
  return found;
end $$;

create or replace function public.mark_operational_incident_delivery_internal(p_fingerprint text, p_delivery_token uuid, p_outcome text, p_error_code text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_outcome <> all(array['failed','delivery_unknown']) or p_error_code !~ '^[a-z_]{1,64}$' then raise exception 'invalid_delivery_outcome'; end if;
  update public.operational_incidents set publication_status=p_outcome, delivery_token=null, delivery_lease_until=null, last_delivery_error=p_error_code
  where fingerprint=p_fingerprint and delivery_token=p_delivery_token;
  return found;
end $$;

create or replace function public.purge_operational_incidents_internal(p_before timestamptz)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count bigint; begin
  delete from public.operational_incidents where last_seen_at < least(p_before, now() - interval '30 days') and publication_status <> 'delivering';
  get diagnostics v_count = row_count;
  delete from public.operational_incident_ingestion_budgets where window_started_at < now() - interval '2 days';
  delete from public.operational_incident_publication_budgets where window_started_at < now() - interval '2 days';
  return v_count;
end $$;

revoke all on function public.reserve_operational_incident_internal(text,uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.claim_operational_incident_delivery_internal(text,uuid,integer) from public, anon, authenticated;
revoke all on function public.finalize_operational_incident_delivery_internal(text,uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.mark_operational_incident_delivery_internal(text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.purge_operational_incidents_internal(timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_operational_incident_internal(text,uuid,text,text,text,text,text) to service_role;
grant execute on function public.claim_operational_incident_delivery_internal(text,uuid,integer) to service_role;
grant execute on function public.finalize_operational_incident_delivery_internal(text,uuid,bigint,text) to service_role;
grant execute on function public.mark_operational_incident_delivery_internal(text,uuid,text,text) to service_role;
grant execute on function public.purge_operational_incidents_internal(timestamptz) to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-expired-operational-incidents',
  '41 3 * * *',
  $$select public.purge_operational_incidents_internal(now() - interval '30 days');$$
);
