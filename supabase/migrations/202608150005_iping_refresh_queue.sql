alter table public.refresh_jobs
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists source_refresh_id bigint references public.source_refreshes(id) on delete set null;

alter table public.source_request_budgets
  add column if not exists queue_window_started_at timestamptz,
  add column if not exists queue_enqueue_count integer not null default 0
    check (queue_enqueue_count between 0 and 4);

create table if not exists public.iping_refresh_enqueue_budgets (
  scope_hash text primary key check (scope_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 0 and 4),
  updated_at timestamptz not null default now()
);

create index if not exists iping_refresh_enqueue_budgets_updated_idx
  on public.iping_refresh_enqueue_budgets(updated_at);

alter table public.iping_refresh_enqueue_budgets enable row level security;
revoke all on table public.iping_refresh_enqueue_budgets from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.refresh_jobs'::regclass
      and conname = 'refresh_jobs_lease_pair_check'
  ) then
    alter table public.refresh_jobs
      add constraint refresh_jobs_lease_pair_check
      check (
        (lease_token is null and lease_expires_at is null)
        or (status = 'running' and lease_token is not null and lease_expires_at is not null)
      ) not valid;
  end if;

end
$$;

create index if not exists refresh_jobs_iping_claim_idx
  on public.refresh_jobs(status, next_attempt_at, requested_at, id)
  where status in ('pending', 'running');

create index if not exists refresh_jobs_lease_expiry_idx
  on public.refresh_jobs(lease_expires_at)
  where status = 'running';

create index if not exists refresh_jobs_source_query_active_idx
  on public.refresh_jobs(source_id, query_key, requested_at desc)
  where status in ('pending', 'running');

revoke all on table public.refresh_jobs from public, anon, authenticated;

create or replace function public.enqueue_iping_refresh_job(
  p_query_name text,
  p_query_key text,
  p_scope_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_query_name text := trim(coalesce(p_query_name, ''));
  v_query_key text := trim(coalesce(p_query_key, ''));
  v_source_id bigint;
  v_source_enabled boolean;
  v_circuit_open_until timestamptz;
  v_refresh_id bigint;
  v_job_id bigint;
  v_job_status public.refresh_status;
  v_active_count integer;
  v_queue_window_started_at timestamptz;
  v_queue_enqueue_count integer;
  v_origin_budget public.iping_refresh_enqueue_budgets%rowtype;
  v_origin_budget_count integer;
  v_refresh_bucket bigint := floor(extract(epoch from v_now) / 21600)::bigint;
begin
  if not (char_length(v_query_name) between 2 and 30)
    or not (char_length(v_query_key) between 1 and 50)
    or coalesce(p_scope_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_iping_refresh_query' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('iping_refresh_enqueue', 0));

  select id, enabled
  into v_source_id, v_source_enabled
  from public.sources
  where code = 'iping'
  for update;

  if v_source_id is null then
    return jsonb_build_object('status', 'source_unavailable');
  end if;

  if not v_source_enabled then
    return jsonb_build_object('status', 'source_disabled');
  end if;

  update public.refresh_jobs
  set status = 'skipped',
      completed_at = v_now,
      next_attempt_at = null,
      last_error_code = 'source_queue_expired',
      lease_token = null,
      lease_expires_at = null
  where source_id = v_source_id
    and requested_at < v_now - interval '24 hours'
    and (
      status = 'pending'
      or (status = 'running' and (lease_expires_at is null or lease_expires_at <= v_now))
    );

  select circuit_open_until
  into v_circuit_open_until
  from public.source_request_budgets
  where source_id = v_source_id;

  if v_circuit_open_until > v_now then
    return jsonb_build_object(
      'status', 'source_unavailable',
      'retryAfterMs', greatest(1, ceil(extract(epoch from (
        v_circuit_open_until - v_now
      )) * 1000)::integer)
    );
  end if;

  select id
  into v_refresh_id
  from public.source_refreshes
  where source_id = v_source_id
    and query_key = v_query_key
    and status in ('succeeded', 'partial')
    and coalesce(expires_at, completed_at + interval '6 hours') > v_now
  order by completed_at desc nulls last, id desc
  limit 1;

  if v_refresh_id is not null then
    return jsonb_build_object(
      'status', 'fresh',
      'refreshId', v_refresh_id
    );
  end if;

  select id
  into v_job_id
  from public.refresh_jobs
  where source_id = v_source_id
    and query_key = v_query_key
    and status in ('pending', 'running')
  order by requested_at desc, id desc
  limit 1;

  if v_job_id is not null then
    return jsonb_build_object('status', 'queued', 'jobId', v_job_id);
  end if;

  insert into public.source_request_budgets(
    source_id,
    window_started_at,
    attempt_count,
    queue_window_started_at,
    queue_enqueue_count
  ) values (v_source_id, v_now, 0, v_now, 0)
  on conflict (source_id) do nothing;

  select queue_window_started_at, queue_enqueue_count
  into v_queue_window_started_at, v_queue_enqueue_count
  from public.source_request_budgets
  where source_id = v_source_id
  for update;

  if v_queue_window_started_at is null
    or v_queue_window_started_at <= v_now - interval '1 minute' then
    update public.source_request_budgets
    set queue_window_started_at = v_now,
        queue_enqueue_count = 0,
        updated_at = v_now
    where source_id = v_source_id;
    v_queue_window_started_at := v_now;
    v_queue_enqueue_count := 0;
  elsif v_queue_enqueue_count >= 4 then
    return jsonb_build_object(
      'status', 'queue_full',
      'retryAfterMs', greatest(1, ceil(extract(epoch from (
        v_queue_window_started_at + interval '1 minute' - v_now
      )) * 1000)::integer)
    );
  end if;

  select count(*)::integer
  into v_active_count
  from public.refresh_jobs
  where source_id = v_source_id
    and status in ('pending', 'running');

  if v_active_count >= 12 then
    return jsonb_build_object('status', 'queue_full');
  end if;

  select * into v_origin_budget
  from public.iping_refresh_enqueue_budgets
  where scope_hash = p_scope_hash;

  if v_origin_budget.scope_hash is null then
    select count(*)::integer
    into v_origin_budget_count
    from public.iping_refresh_enqueue_budgets;
    if v_origin_budget_count >= 256 then
      return jsonb_build_object('status', 'queue_full');
    end if;
  elsif v_origin_budget.window_started_at > v_now - interval '10 minutes'
    and v_origin_budget.request_count >= 4 then
    return jsonb_build_object(
      'status', 'origin_limited',
      'retryAfterMs', greatest(1, ceil(extract(epoch from (
        v_origin_budget.window_started_at + interval '10 minutes' - v_now
      )) * 1000)::integer)
    );
  end if;

  insert into public.refresh_jobs(
    source_id,
    query_key,
    query_payload,
    job_type,
    status,
    refresh_bucket,
    requested_at,
    next_attempt_at
  ) values (
    v_source_id,
    v_query_key,
    jsonb_build_object('name', v_query_name),
    'browser',
    'pending',
    v_refresh_bucket,
    v_now,
    v_now
  )
  on conflict (source_id, query_key, refresh_bucket) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id, status
    into v_job_id, v_job_status
    from public.refresh_jobs
    where source_id = v_source_id
      and query_key = v_query_key
      and refresh_bucket = v_refresh_bucket;

    if v_job_status not in ('pending', 'running') then
      return jsonb_build_object(
        'status', 'cooldown',
        'retryAfterMs', greatest(1, ceil((
          ((v_refresh_bucket + 1) * 21600) - extract(epoch from v_now)
        ) * 1000)::integer)
      );
    end if;
  end if;

  insert into public.iping_refresh_enqueue_budgets(
    scope_hash, window_started_at, request_count, updated_at
  ) values (p_scope_hash, v_now, 1, v_now)
  on conflict (scope_hash) do update
  set window_started_at = case
        when public.iping_refresh_enqueue_budgets.window_started_at
          <= excluded.updated_at - interval '10 minutes'
          then excluded.window_started_at
        else public.iping_refresh_enqueue_budgets.window_started_at
      end,
      request_count = case
        when public.iping_refresh_enqueue_budgets.window_started_at
          <= excluded.updated_at - interval '10 minutes'
          then 1
        else public.iping_refresh_enqueue_budgets.request_count + 1
      end,
      updated_at = excluded.updated_at;

  update public.source_request_budgets
  set queue_enqueue_count = queue_enqueue_count + 1,
      updated_at = v_now
  where source_id = v_source_id;

  return jsonb_build_object('status', 'queued', 'jobId', v_job_id);
end;
$$;

create or replace function public.claim_iping_refresh_job(
  p_lease_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_source_id bigint;
  v_source_enabled boolean;
  v_circuit_open_until timestamptz;
  v_job public.refresh_jobs%rowtype;
begin
  if p_lease_token is null then
    raise exception 'invalid_iping_refresh_lease' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('iping_refresh_claim', 0));

  select id, enabled
  into v_source_id, v_source_enabled
  from public.sources
  where code = 'iping';

  if v_source_id is null or not v_source_enabled then
    return jsonb_build_object('status', 'source_disabled');
  end if;

  select circuit_open_until
  into v_circuit_open_until
  from public.source_request_budgets
  where source_id = v_source_id;

  if v_circuit_open_until > v_now then
    return jsonb_build_object(
      'status', 'source_unavailable',
      'retryAfterMs', greatest(1, ceil(extract(epoch from (
        v_circuit_open_until - v_now
      )) * 1000)::integer)
    );
  end if;

  update public.refresh_jobs
  set status = 'skipped',
      completed_at = v_now,
      next_attempt_at = null,
      last_error_code = 'source_queue_expired',
      lease_token = null,
      lease_expires_at = null
  where source_id = v_source_id
    and requested_at < v_now - interval '24 hours'
    and (
      status = 'pending'
      or (status = 'running' and (lease_expires_at is null or lease_expires_at <= v_now))
    );

  update public.refresh_jobs
  set status = case
        when attempt_count >= 3 then 'failed'::public.refresh_status
        else 'pending'::public.refresh_status
      end,
      completed_at = case when attempt_count >= 3 then v_now else null end,
      next_attempt_at = case when attempt_count >= 3 then null else v_now end,
      last_error_code = 'source_worker_lease_expired',
      lease_token = null,
      lease_expires_at = null
  where source_id = v_source_id
    and status = 'running'
    and (lease_expires_at is null or lease_expires_at <= v_now);

  select job.*
  into v_job
  from public.refresh_jobs job
  where job.source_id = v_source_id
    and job.status = 'pending'
    and job.attempt_count < 3
    and coalesce(job.next_attempt_at, job.requested_at) <= v_now
    and jsonb_typeof(job.query_payload) = 'object'
    and job.query_payload = jsonb_build_object(
      'name', job.query_payload -> 'name'
    )
    and jsonb_typeof(job.query_payload -> 'name') = 'string'
    and char_length(trim(job.query_payload ->> 'name')) between 2 and 30
  order by requested_at, id
  for update skip locked
  limit 1;

  if v_job.id is null then
    return jsonb_build_object('status', 'empty');
  end if;

  update public.refresh_jobs
  set status = 'running',
      started_at = coalesce(started_at, v_now),
      attempt_count = attempt_count + 1,
      lease_token = p_lease_token,
      lease_expires_at = v_now + interval '4 minutes',
      next_attempt_at = null,
      last_error_code = null
  where id = v_job.id;

  return jsonb_build_object(
    'status', 'claimed',
    'jobId', v_job.id,
    'queryName', v_job.query_payload ->> 'name',
    'queryKey', v_job.query_key,
    'attemptCount', v_job.attempt_count + 1,
    'leaseExpiresAt', v_now + interval '4 minutes'
  );
end;
$$;

create or replace function public.resolve_iping_refresh_job(
  p_job_id bigint,
  p_lease_token uuid,
  p_refresh_id bigint default null,
  p_error_code text default null,
  p_retry_after_ms integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.refresh_jobs%rowtype;
  v_source_id bigint;
  v_error_code text;
  v_retry_after_ms integer;
  v_is_transient boolean;
  v_is_kill_switch boolean;
begin
  if p_job_id is null or p_lease_token is null then
    raise exception 'invalid_iping_refresh_resolution' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('iping_refresh_enqueue', 0));

  select id into v_source_id
  from public.sources
  where code = 'iping';

  select job.*
  into v_job
  from public.refresh_jobs job
  where job.id = p_job_id
    and job.source_id = v_source_id
    and job.status = 'running'
    and job.lease_token = p_lease_token
    and job.lease_expires_at > v_now
  for update;

  if v_job.id is null then
    return jsonb_build_object('status', 'lease_lost', 'jobId', p_job_id);
  end if;

  if p_error_code is null then
    if p_refresh_id is null or not exists (
      select 1
      from public.source_refreshes refresh
      where refresh.id = p_refresh_id
        and refresh.source_id = v_source_id
        and refresh.query_key = v_job.query_key
        and refresh.status in ('succeeded', 'partial')
    ) then
      raise exception 'invalid_iping_refresh_result' using errcode = '22023';
    end if;

    update public.refresh_jobs
    set status = 'succeeded',
        completed_at = v_now,
        next_attempt_at = null,
        last_error_code = null,
        source_refresh_id = p_refresh_id,
        lease_token = null,
        lease_expires_at = null
    where id = v_job.id;

    return jsonb_build_object(
      'status', 'succeeded',
      'jobId', v_job.id,
      'refreshId', p_refresh_id
    );
  end if;

  v_error_code := case
    when p_error_code = any (array[
      'source_timeout',
      'source_request_failed',
      'source_rate_limited',
      'source_persist_failed',
      'source_auth_failed',
      'source_schema_changed',
      'source_blocked',
      'source_not_configured'
    ]::text[]) then p_error_code
    else 'source_refresh_failed'
  end;
  v_is_transient := v_error_code = any (array[
    'source_timeout',
    'source_request_failed',
    'source_rate_limited',
    'source_persist_failed'
  ]::text[]);
  v_is_kill_switch := v_error_code = any (array[
    'source_auth_failed',
    'source_schema_changed',
    'source_blocked',
    'source_not_configured'
  ]::text[]);

  if v_is_transient and v_job.attempt_count < 3 then
    v_retry_after_ms := least(3600000, greatest(900000, coalesce(p_retry_after_ms, 900000)));

    update public.refresh_jobs
    set status = 'pending',
        completed_at = null,
        next_attempt_at = v_now + (v_retry_after_ms * interval '1 millisecond'),
        last_error_code = v_error_code,
        lease_token = null,
        lease_expires_at = null
    where id = v_job.id;

    return jsonb_build_object(
      'status', 'retry_scheduled',
      'jobId', v_job.id,
      'retryAfterMs', v_retry_after_ms
    );
  end if;

  update public.refresh_jobs
  set status = 'failed',
      completed_at = v_now,
      next_attempt_at = null,
      last_error_code = v_error_code,
      lease_token = null,
      lease_expires_at = null
  where id = v_job.id;

  if v_is_kill_switch then
    insert into public.source_request_budgets(
      source_id,
      window_started_at,
      attempt_count,
      deterministic_failure_count,
      circuit_open_until,
      updated_at
    ) values (
      v_source_id,
      v_now,
      0,
      2,
      v_now + interval '6 hours',
      v_now
    )
    on conflict (source_id) do update
    set deterministic_failure_count = 2,
        circuit_open_until = excluded.circuit_open_until,
        updated_at = excluded.updated_at;

    update public.refresh_jobs
    set status = 'skipped',
        completed_at = v_now,
        next_attempt_at = null,
        last_error_code = 'source_backlog_stopped',
        lease_token = null,
        lease_expires_at = null
    where source_id = v_source_id
      and id <> v_job.id
      and status in ('pending', 'running');
  end if;

  return jsonb_build_object(
    'status', 'failed',
    'jobId', v_job.id,
    'errorCode', v_error_code
  );
end;
$$;

create or replace function public.purge_iping_refresh_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_source_id bigint;
  v_expired_count integer := 0;
  v_deleted_count integer := 0;
begin
  select id into v_source_id
  from public.sources
  where code = 'iping';

  if v_source_id is null then
    return jsonb_build_object('expired', 0, 'deleted', 0);
  end if;

  update public.refresh_jobs
  set status = 'skipped',
      completed_at = v_now,
      next_attempt_at = null,
      last_error_code = 'source_queue_expired',
      lease_token = null,
      lease_expires_at = null
  where source_id = v_source_id
    and requested_at < v_now - interval '24 hours'
    and (
      status = 'pending'
      or (status = 'running' and (lease_expires_at is null or lease_expires_at <= v_now))
    );
  get diagnostics v_expired_count = row_count;

  delete from public.refresh_jobs
  where source_id = v_source_id
    and status in ('succeeded', 'partial', 'failed', 'skipped')
    and completed_at < v_now - interval '7 days';
  get diagnostics v_deleted_count = row_count;

  delete from public.iping_refresh_enqueue_budgets
  where updated_at < v_now - interval '1 day';

  return jsonb_build_object(
    'expired', v_expired_count,
    'deleted', v_deleted_count
  );
end;
$$;

revoke all on function public.enqueue_iping_refresh_job(text, text, text) from public, anon, authenticated;
revoke all on function public.claim_iping_refresh_job(uuid) from public, anon, authenticated;
revoke all on function public.resolve_iping_refresh_job(bigint, uuid, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.purge_iping_refresh_jobs() from public, anon, authenticated;
grant execute on function public.enqueue_iping_refresh_job(text, text, text) to service_role;
grant execute on function public.claim_iping_refresh_job(uuid) to service_role;
grant execute on function public.resolve_iping_refresh_job(bigint, uuid, bigint, text, integer) to service_role;
grant execute on function public.purge_iping_refresh_jobs() to service_role;

update public.sources
set parser_version = 'iping-4', updated_at = now()
where code = 'iping';

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-iping-refresh-jobs',
  '47 3 * * *',
  $$select public.purge_iping_refresh_jobs();$$
);

comment on function public.enqueue_iping_refresh_job(text, text, text) is
  'Atomically applies origin/global admission and queues one bounded iPing name lookup unless cached data, an active job, a source stop, or the queue limit applies.';
comment on function public.claim_iping_refresh_job(uuid) is
  'Claims one oldest eligible iPing job under a four-minute lease and recovers expired leases.';
comment on function public.resolve_iping_refresh_job(bigint, uuid, bigint, text, integer) is
  'Completes a leased iPing job, retries transient failures at most three times, and stops the backlog on deterministic failures.';
comment on function public.purge_iping_refresh_jobs() is
  'Expires stale pending iPing work after one day and deletes terminal job metadata after seven days.';
