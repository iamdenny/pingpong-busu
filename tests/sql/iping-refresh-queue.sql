begin;

do $$
declare
  v_source_id bigint;
  v_job_id bigint;
  v_other_job_id bigint;
  v_refresh_id bigint;
  v_result jsonb;
  v_budget_attempt integer;
  v_attack_attempt integer;
  v_expired_job_id bigint;
begin
  select id into strict v_source_id
  from public.sources
  where code = 'iping';

  update public.sources
  set enabled = true
  where id = v_source_id;

  delete from public.refresh_jobs
  where source_id = v_source_id;

  delete from public.source_refreshes
  where source_id = v_source_id
    and query_key like 'issue74queue%';

  update public.source_request_budgets
  set deterministic_failure_count = 0,
      circuit_open_until = null,
      queue_window_started_at = clock_timestamp(),
      queue_enqueue_count = 0
  where source_id = v_source_id;

  delete from public.iping_refresh_enqueue_budgets
  where scope_hash in (repeat('a', 64), repeat('b', 64));

  for v_budget_attempt in 1..4 loop
    update public.source_request_budgets
    set queue_window_started_at = clock_timestamp(),
        queue_enqueue_count = 0
    where source_id = v_source_id;
    v_result := public.enqueue_iping_refresh_job(
      '예산테스트',
      'issue74budget' || v_budget_attempt,
      repeat('a', 64)
    );
    if v_result ->> 'status' <> 'queued' then
      raise exception 'origin budget rejected attempt %: %', v_budget_attempt, v_result;
    end if;
  end loop;

  update public.source_request_budgets
  set queue_window_started_at = clock_timestamp(),
      queue_enqueue_count = 0
  where source_id = v_source_id;
  v_result := public.enqueue_iping_refresh_job(
    '예산초과',
    'issue74budgetfive',
    repeat('a', 64)
  );
  if v_result ->> 'status' <> 'origin_limited'
    or (v_result ->> 'retryAfterMs')::integer <= 0 then
    raise exception 'origin budget did not reject the fifth job: %', v_result;
  end if;

  delete from public.refresh_jobs
  where source_id = v_source_id;
  delete from public.iping_refresh_enqueue_budgets
  where scope_hash = repeat('a', 64);
  update public.source_request_budgets
  set queue_window_started_at = clock_timestamp(),
      queue_enqueue_count = 0
  where source_id = v_source_id;

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
    'issue74queueone',
    jsonb_build_object('name', '만료테스트'),
    'browser',
    'pending',
    floor(extract(epoch from clock_timestamp() - interval '25 hours') / 21600)::bigint,
    clock_timestamp() - interval '25 hours',
    clock_timestamp() - interval '25 hours'
  ) returning id into v_expired_job_id;

  v_result := public.enqueue_iping_refresh_job(
    '큐테스트하나',
    'issue74queueone',
    repeat('b', 64)
  );
  if v_result ->> 'status' <> 'queued' then
    raise exception 'expected queued, got %', v_result;
  end if;
  v_job_id := (v_result ->> 'jobId')::bigint;
  if v_job_id = v_expired_job_id then
    raise exception 'enqueue reused an expired same-query job: %', v_result;
  end if;
  if not exists (
    select 1
    from public.refresh_jobs
    where id = v_expired_job_id
      and status = 'skipped'
      and last_error_code = 'source_queue_expired'
  ) then
    raise exception 'enqueue did not expire stale same-query work';
  end if;

  for v_attack_attempt in 1..10 loop
    v_result := public.enqueue_iping_refresh_job(
      '큐테스트하나',
      'issue74queueone',
      lpad(to_hex(v_attack_attempt), 64, '0')
    );
    if (v_result ->> 'jobId')::bigint <> v_job_id then
      raise exception 'rotating origins bypassed active dedupe: %', v_result;
    end if;
  end loop;

  if exists (
    select 1
    from public.iping_refresh_enqueue_budgets
    where scope_hash <> repeat('b', 64)
  ) then
    raise exception 'deduplicated requests created origin budget rows';
  end if;

  v_result := public.enqueue_iping_refresh_job(
    '큐테스트하나',
    'issue74queueone',
    repeat('b', 64)
  );
  if (v_result ->> 'jobId')::bigint <> v_job_id then
    raise exception 'enqueue did not deduplicate the active job: %', v_result;
  end if;

  v_result := public.claim_iping_refresh_job(
    '00000000-0000-4000-8000-000000000001'::uuid
  );
  if v_result ->> 'status' <> 'claimed'
    or (v_result ->> 'jobId')::bigint <> v_job_id
    or (v_result ->> 'attemptCount')::integer <> 1 then
    raise exception 'first claim failed: %', v_result;
  end if;

  if not exists (
    select 1
    from public.refresh_jobs
    where id = v_expired_job_id
      and status = 'skipped'
      and last_error_code = 'source_queue_expired'
  ) then
    raise exception 'claim did not expire stale pending work';
  end if;

  v_result := public.claim_iping_refresh_job(
    '00000000-0000-4000-8000-000000000002'::uuid
  );
  if v_result ->> 'status' <> 'empty' then
    raise exception 'a running lease was claimed twice: %', v_result;
  end if;

  update public.refresh_jobs
  set lease_expires_at = clock_timestamp() - interval '1 second'
  where id = v_job_id;

  v_result := public.claim_iping_refresh_job(
    '00000000-0000-4000-8000-000000000002'::uuid
  );
  if v_result ->> 'status' <> 'claimed'
    or (v_result ->> 'attemptCount')::integer <> 2 then
    raise exception 'expired lease was not reclaimed once: %', v_result;
  end if;

  v_result := public.resolve_iping_refresh_job(
    v_job_id,
    '00000000-0000-4000-8000-000000000002'::uuid,
    null,
    'source_timeout',
    1
  );
  if v_result ->> 'status' <> 'retry_scheduled'
    or (v_result ->> 'retryAfterMs')::integer <> 900000 then
    raise exception 'transient retry was not bounded: %', v_result;
  end if;

  update public.refresh_jobs
  set next_attempt_at = clock_timestamp() - interval '1 second'
  where id = v_job_id;

  v_result := public.claim_iping_refresh_job(
    '00000000-0000-4000-8000-000000000003'::uuid
  );
  if v_result ->> 'status' <> 'claimed'
    or (v_result ->> 'attemptCount')::integer <> 3 then
    raise exception 'scheduled retry was not claimed: %', v_result;
  end if;

  insert into public.source_refreshes(
    source_id,
    query_key,
    query_display,
    status,
    requested_at,
    started_at,
    completed_at,
    parser_version,
    expires_at
  ) values (
    v_source_id,
    'issue74queueone',
    '큐테스트하나',
    'succeeded',
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp(),
    'iping-4',
    clock_timestamp() + interval '6 hours'
  ) returning id into v_refresh_id;

  v_result := public.resolve_iping_refresh_job(
    v_job_id,
    '00000000-0000-4000-8000-000000000003'::uuid,
    v_refresh_id,
    null,
    null
  );
  if v_result ->> 'status' <> 'succeeded' then
    raise exception 'success resolution failed: %', v_result;
  end if;

  v_result := public.enqueue_iping_refresh_job(
    '큐테스트하나',
    'issue74queueone',
    repeat('b', 64)
  );
  if v_result ->> 'status' <> 'fresh'
    or (v_result ->> 'refreshId')::bigint <> v_refresh_id then
    raise exception 'fresh result was not reused: %', v_result;
  end if;

  v_result := public.enqueue_iping_refresh_job(
    '큐테스트둘',
    'issue74queuetwo',
    repeat('b', 64)
  );
  v_job_id := (v_result ->> 'jobId')::bigint;

  v_result := public.enqueue_iping_refresh_job(
    '큐테스트셋',
    'issue74queuethree',
    repeat('b', 64)
  );
  v_other_job_id := (v_result ->> 'jobId')::bigint;

  v_result := public.claim_iping_refresh_job(
    '00000000-0000-4000-8000-000000000004'::uuid
  );
  if (v_result ->> 'jobId')::bigint <> v_job_id then
    raise exception 'oldest pending job was not claimed: %', v_result;
  end if;

  v_result := public.resolve_iping_refresh_job(
    v_job_id,
    '00000000-0000-4000-8000-000000000004'::uuid,
    null,
    'source_auth_failed',
    null
  );
  if v_result ->> 'status' <> 'failed' then
    raise exception 'deterministic error was not terminal: %', v_result;
  end if;

  if not exists (
    select 1
    from public.refresh_jobs
    where id = v_other_job_id
      and status = 'skipped'
      and last_error_code = 'source_backlog_stopped'
  ) then
    raise exception 'deterministic error did not stop the backlog';
  end if;

  v_result := public.enqueue_iping_refresh_job(
    '큐테스트넷',
    'issue74queuefour',
    repeat('b', 64)
  );
  if v_result ->> 'status' <> 'source_unavailable' then
    raise exception 'open circuit accepted new work: %', v_result;
  end if;
end
$$;

rollback;
