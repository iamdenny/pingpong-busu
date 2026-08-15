create or replace function public.recover_iping_refresh_job()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_source_id bigint;
  v_source_enabled boolean;
  v_running_job_id bigint;
  v_pending_job_id bigint;
  v_failed_job_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('iping_refresh_enqueue', 0));
  perform pg_advisory_xact_lock(hashtextextended('iping_refresh_claim', 0));

  select id, enabled
  into v_source_id, v_source_enabled
  from public.sources
  where code = 'iping';

  if v_source_id is null then
    return jsonb_build_object('status', 'source_unavailable');
  end if;

  if not v_source_enabled then
    return jsonb_build_object('status', 'source_disabled');
  end if;

  select id
  into v_running_job_id
  from public.refresh_jobs
  where source_id = v_source_id
    and status = 'running'
  order by requested_at, id
  for update
  limit 1;

  if v_running_job_id is not null then
    return jsonb_build_object('status', 'busy', 'jobId', v_running_job_id);
  end if;

  select id
  into v_pending_job_id
  from public.refresh_jobs
  where source_id = v_source_id
    and status = 'pending'
  order by requested_at, id
  for update
  limit 1;

  if v_pending_job_id is not null then
    insert into public.source_request_budgets(
      source_id,
      window_started_at,
      attempt_count,
      deterministic_failure_count,
      circuit_open_until,
      updated_at
    ) values (v_source_id, v_now, 0, 0, null, v_now)
    on conflict (source_id) do update
    set deterministic_failure_count = 0,
        circuit_open_until = null,
        updated_at = excluded.updated_at;

    return jsonb_build_object(
      'status', 'already_pending',
      'jobId', v_pending_job_id
    );
  end if;

  select job.id
  into v_failed_job_id
  from public.refresh_jobs job
  where job.source_id = v_source_id
    and job.status = 'failed'
    and job.completed_at >= v_now - interval '24 hours'
    and job.last_error_code = any (array[
      'source_auth_failed',
      'source_schema_changed',
      'source_blocked',
      'source_not_configured'
    ]::text[])
    and jsonb_typeof(job.query_payload) = 'object'
    and job.query_payload = jsonb_build_object(
      'name', job.query_payload -> 'name'
    )
    and jsonb_typeof(job.query_payload -> 'name') = 'string'
    and char_length(trim(job.query_payload ->> 'name')) between 2 and 30
    and char_length(job.query_key) between 1 and 50
  order by completed_at desc nulls last, id desc
  for update
  limit 1;

  if v_failed_job_id is null then
    insert into public.source_request_budgets(
      source_id,
      window_started_at,
      attempt_count,
      deterministic_failure_count,
      circuit_open_until,
      updated_at
    ) values (v_source_id, v_now, 0, 0, null, v_now)
    on conflict (source_id) do update
    set deterministic_failure_count = 0,
        circuit_open_until = null,
        updated_at = excluded.updated_at;

    return jsonb_build_object('status', 'reset_only');
  end if;

  update public.refresh_jobs
  set status = 'pending',
      requested_at = v_now,
      started_at = null,
      completed_at = null,
      attempt_count = 0,
      next_attempt_at = v_now,
      last_error_code = null,
      source_refresh_id = null,
      lease_token = null,
      lease_expires_at = null
  where id = v_failed_job_id;

  insert into public.source_request_budgets(
    source_id,
    window_started_at,
    attempt_count,
    deterministic_failure_count,
    circuit_open_until,
    updated_at
  ) values (v_source_id, v_now, 0, 0, null, v_now)
  on conflict (source_id) do update
  set deterministic_failure_count = 0,
      circuit_open_until = null,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'status', 'requeued',
    'jobId', v_failed_job_id
  );
end;
$$;

revoke all on function public.recover_iping_refresh_job()
  from public, anon, authenticated;
grant execute on function public.recover_iping_refresh_job()
  to service_role;

comment on function public.recover_iping_refresh_job() is
  'Resets iPing circuit protection and requeues at most one recent deterministic failure unless work is already running or pending.';
