create extension if not exists dblink;

do $$
declare
  v_source_id bigint;
begin
  select id into strict v_source_id
  from public.sources
  where code = 'iping';

  update public.sources
  set enabled = true
  where id = v_source_id;

  delete from public.refresh_jobs
  where source_id = v_source_id
    and query_key like 'ipingrecoveryrace%';

  update public.source_request_budgets
  set deterministic_failure_count = 0,
      circuit_open_until = null
  where source_id = v_source_id;

  insert into public.refresh_jobs(
    source_id,
    query_key,
    query_payload,
    job_type,
    status,
    refresh_bucket,
    requested_at,
    completed_at,
    attempt_count,
    last_error_code
  ) values (
    v_source_id,
    'ipingrecoveryracefailed',
    jsonb_build_object('name', '복구실패'),
    'browser',
    'failed',
    floor(extract(epoch from clock_timestamp()) / 21600)::bigint - 1,
    clock_timestamp() - interval '5 minutes',
    clock_timestamp() - interval '1 minute',
    1,
    'source_auth_failed'
  );

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
    'ipingrecoveryracepending',
    jsonb_build_object('name', '복구대기'),
    'browser',
    'pending',
    floor(extract(epoch from clock_timestamp()) / 21600)::bigint,
    clock_timestamp(),
    clock_timestamp()
  );
end
$$;

do $$
declare
  v_connection text := current_setting('busu.iping_test_connection', true);
  v_claim jsonb;
  v_recovery jsonb;
  v_active_count integer;
begin
  if nullif(v_connection, '') is null then
    raise exception 'set busu.iping_test_connection before running this test';
  end if;

  perform dblink_connect(
    'iping_claim',
    v_connection
  );
  perform dblink_connect(
    'iping_recovery',
    v_connection
  );
  perform dblink_exec('iping_claim', 'begin');

  select result::jsonb into strict v_claim
  from dblink(
    'iping_claim',
    $query$select public.claim_iping_refresh_job(
      '00000000-0000-4000-8000-000000000099'::uuid
    )::text$query$
  ) as claimed(result text);

  if v_claim ->> 'status' <> 'claimed' then
    raise exception 'concurrent claim setup failed: %', v_claim;
  end if;

  perform dblink_send_query(
    'iping_recovery',
    'select public.recover_iping_refresh_job()::text'
  );
  perform pg_sleep(0.2);

  if dblink_is_busy('iping_recovery') <> 1 then
    raise exception 'recovery did not wait for the claim lock';
  end if;

  perform dblink_exec('iping_claim', 'commit');

  select result::jsonb into strict v_recovery
  from dblink_get_result('iping_recovery') as recovered(result text);

  if v_recovery ->> 'status' <> 'busy'
    or (v_recovery ->> 'jobId')::bigint <> (v_claim ->> 'jobId')::bigint then
    raise exception 'recovery did not observe the committed running job: %', v_recovery;
  end if;

  select count(*)::integer into v_active_count
  from public.refresh_jobs job
  join public.sources source on source.id = job.source_id
  where source.code = 'iping'
    and job.status in ('pending', 'running');

  if v_active_count <> 1 then
    raise exception 'claim/recovery race created % active jobs', v_active_count;
  end if;

  if not exists (
    select 1
    from public.refresh_jobs job
    join public.sources source on source.id = job.source_id
    where source.code = 'iping'
      and job.query_key = 'ipingrecoveryracefailed'
      and job.status = 'failed'
      and job.last_error_code = 'source_auth_failed'
  ) then
    raise exception 'claim/recovery race requeued the failed job';
  end if;

  perform dblink_disconnect('iping_claim');
  perform dblink_disconnect('iping_recovery');
end
$$;
