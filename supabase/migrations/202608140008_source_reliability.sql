alter table public.source_request_budgets
  add column if not exists deterministic_failure_count integer not null default 0
    check (deterministic_failure_count between 0 and 2),
  add column if not exists circuit_open_until timestamptz;

create table if not exists public.source_request_diagnostics (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.sources(id) on delete cascade,
  phase text not null check (phase = any (array[
    'fetch', 'login_page', 'login_submit', 'login_verify', 'entry_search',
    'nationwide_awards_search', 'district_awards_search', 'parse', 'persist',
    'complete'
  ]::text[])),
  outcome text not null check (outcome = any (array['succeeded', 'failed']::text[])),
  error_code text check (error_code is null or error_code = any (array[
    'source_timeout', 'source_blocked', 'source_rate_limited',
    'source_auth_failed', 'source_not_configured', 'source_schema_changed',
    'source_request_failed', 'source_persist_failed', 'source_refresh_failed'
  ]::text[])),
  duration_ms integer not null check (duration_ms between 0 and 120000),
  occurred_at timestamptz not null default now()
);

create index if not exists source_request_diagnostics_source_time_idx
  on public.source_request_diagnostics(source_id, occurred_at desc);
create index if not exists source_request_diagnostics_occurred_at_idx
  on public.source_request_diagnostics(occurred_at);

alter table public.source_request_diagnostics enable row level security;
revoke all on table public.source_request_diagnostics from public, anon, authenticated;

create or replace function public.claim_source_request_with_policy(
  p_source_code text,
  p_query_key text,
  p_min_interval_ms integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id bigint;
  v_now timestamptz := clock_timestamp();
  v_claimed_at timestamptz;
  v_throttle public.source_request_throttles%rowtype;
  v_interval_ms integer := greatest(5000, least(coalesce(p_min_interval_ms, 5000), 60000));
  v_window interval := interval '1 minute';
  v_budget public.source_request_budgets%rowtype;
  v_budget_limit integer := case when p_source_code = 'iping' then 2 else 6 end;
begin
  if char_length(trim(coalesce(p_query_key, ''))) = 0 then
    return jsonb_build_object('reason', 'source_rate_limited', 'retryAfterMs', v_interval_ms);
  end if;

  select id into v_source_id
  from public.sources
  where code = p_source_code and enabled = true;

  if v_source_id is null then
    return jsonb_build_object('reason', 'source_rate_limited', 'retryAfterMs', v_interval_ms);
  end if;

  if p_source_code = any (array['iping', 'newttplay', 'airping']::text[]) then
    insert into public.source_request_budgets(source_id, window_started_at, attempt_count)
    values(v_source_id, v_now, 0)
    on conflict (source_id) do nothing;

    select * into v_budget
    from public.source_request_budgets
    where source_id = v_source_id
    for update;

    if p_source_code = 'iping' and v_budget.circuit_open_until > v_now then
      return jsonb_build_object(
        'reason', 'source_circuit_open',
        'retryAfterMs', greatest(1, ceil(extract(epoch from (
          v_budget.circuit_open_until - v_now
        )) * 1000)::integer)
      );
    end if;

    if v_budget.window_started_at <= v_now - v_window then
      update public.source_request_budgets
      set window_started_at = v_now,
          attempt_count = 0,
          deterministic_failure_count = case
            when circuit_open_until is not null and circuit_open_until <= v_now then 0
            else deterministic_failure_count
          end,
          circuit_open_until = case
            when circuit_open_until is not null and circuit_open_until <= v_now then null
            else circuit_open_until
          end,
          updated_at = v_now
      where source_id = v_source_id
      returning * into v_budget;
    elsif v_budget.attempt_count >= v_budget_limit then
      return jsonb_build_object(
        'reason', 'source_rate_limited',
        'retryAfterMs', greatest(1, ceil(extract(epoch from (
          v_budget.window_started_at + v_window - clock_timestamp()
        )) * 1000)::integer)
      );
    end if;
  end if;

  insert into public.source_request_throttles as throttle(
    source_id, query_key, last_attempt_at, window_started_at, attempt_count
  )
  values(v_source_id, p_query_key, v_now, v_now, 1)
  on conflict (source_id, query_key) do update
  set last_attempt_at = excluded.last_attempt_at,
      window_started_at = case
        when throttle.window_started_at <= excluded.last_attempt_at - v_window
          then excluded.last_attempt_at
        else throttle.window_started_at
      end,
      attempt_count = case
        when throttle.window_started_at <= excluded.last_attempt_at - v_window then 1
        else throttle.attempt_count + 1
      end
  where throttle.last_attempt_at
      <= excluded.last_attempt_at - (v_interval_ms * interval '1 millisecond')
    and (
      throttle.window_started_at <= excluded.last_attempt_at - v_window
      or throttle.attempt_count < 4
    )
  returning last_attempt_at into v_claimed_at;

  if v_claimed_at is not null then
    if p_source_code = any (array['iping', 'newttplay', 'airping']::text[]) then
      update public.source_request_budgets
      set attempt_count = attempt_count + 1, updated_at = v_claimed_at
      where source_id = v_source_id;
    end if;
    update public.sources
    set last_attempt_at = v_claimed_at, updated_at = v_claimed_at
    where id = v_source_id;
    return jsonb_build_object('reason', 'claimed', 'retryAfterMs', 0);
  end if;

  select * into v_throttle
  from public.source_request_throttles
  where source_id = v_source_id and query_key = p_query_key;

  if v_throttle.attempt_count >= 4
    and v_throttle.window_started_at > v_now - v_window then
    return jsonb_build_object(
      'reason', 'source_rate_limited',
      'retryAfterMs', greatest(1, ceil(extract(epoch from (
        v_throttle.window_started_at + v_window - clock_timestamp()
      )) * 1000)::integer)
    );
  end if;

  return jsonb_build_object(
    'reason', 'source_rate_limited',
    'retryAfterMs', greatest(1, ceil(extract(epoch from (
      v_throttle.last_attempt_at
        + (v_interval_ms * interval '1 millisecond')
        - clock_timestamp()
    )) * 1000)::integer)
  );
end;
$$;

create or replace function public.record_source_request_outcome(
  p_source_code text,
  p_error_code text,
  p_phase text,
  p_duration_ms integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id bigint;
  v_now timestamptz := clock_timestamp();
  v_phase text := case
    when p_phase = any (array[
      'fetch', 'login_page', 'login_submit', 'login_verify', 'entry_search',
      'nationwide_awards_search', 'district_awards_search', 'parse', 'persist',
      'complete'
    ]::text[]) then p_phase
    else 'fetch'
  end;
  v_error_code text := case
    when p_error_code is null then null
    when p_error_code = any (array[
      'source_timeout', 'source_blocked', 'source_rate_limited',
      'source_auth_failed', 'source_not_configured', 'source_schema_changed',
      'source_request_failed', 'source_persist_failed', 'source_refresh_failed'
    ]::text[]) then p_error_code
    else 'source_refresh_failed'
  end;
begin
  select id into v_source_id
  from public.sources
  where code = p_source_code;
  if v_source_id is null then return; end if;

  insert into public.source_request_diagnostics(
    source_id, phase, outcome, error_code, duration_ms, occurred_at
  ) values (
    v_source_id,
    v_phase,
    case when p_error_code is null then 'succeeded' else 'failed' end,
    v_error_code,
    greatest(0, least(coalesce(p_duration_ms, 0), 120000)),
    v_now
  );

  delete from public.source_request_diagnostics
  where occurred_at < v_now - interval '14 days';

  if p_source_code <> 'iping' then return; end if;

  insert into public.source_request_budgets(source_id, window_started_at, attempt_count)
  values(v_source_id, v_now, 0)
  on conflict (source_id) do nothing;

  if p_error_code is null then
    update public.source_request_budgets
    set deterministic_failure_count = 0,
        circuit_open_until = null,
        updated_at = v_now
    where source_id = v_source_id;
  elsif v_error_code = any (array['source_auth_failed', 'source_schema_changed']::text[]) then
    update public.source_request_budgets
    set deterministic_failure_count = least(2, deterministic_failure_count + 1),
        circuit_open_until = case
          when deterministic_failure_count + 1 >= 2 then v_now + interval '10 minutes'
          else null
        end,
        updated_at = v_now
    where source_id = v_source_id;
  else
    update public.source_request_budgets
    set deterministic_failure_count = 0,
        circuit_open_until = null,
        updated_at = v_now
    where source_id = v_source_id;
  end if;
end;
$$;

create or replace function public.delete_expired_source_request_diagnostics()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.source_request_diagnostics
  where occurred_at < clock_timestamp() - interval '14 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.claim_source_request_with_policy(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_source_request_with_policy(text, text, integer)
  to service_role;

revoke all on function public.record_source_request_outcome(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_source_request_outcome(text, text, text, integer)
  to service_role;

revoke all on function public.delete_expired_source_request_diagnostics()
  from public, anon, authenticated;
grant execute on function public.delete_expired_source_request_diagnostics()
  to service_role;

select cron.schedule(
  'delete-expired-source-request-diagnostics',
  '43 3 * * *',
  $$select public.delete_expired_source_request_diagnostics();$$
);

comment on table public.source_request_diagnostics is
  'Private, bounded source request metadata. Query terms, response bodies, cookies, credentials, and raw errors are forbidden.';
comment on function public.claim_source_request_with_policy(text, text, integer) is
  'Atomically applies query throttles, source budgets, and the iPing circuit before an outbound request; Airping is also source-budgeted.';
comment on function public.record_source_request_outcome(text, text, text, integer) is
  'Records allow-listed request metadata and opens the iPing circuit for ten minutes after two consecutive deterministic failures.';
comment on function public.delete_expired_source_request_diagnostics() is
  'Deletes private source request diagnostics older than fourteen days; scheduled daily with pg_cron.';
