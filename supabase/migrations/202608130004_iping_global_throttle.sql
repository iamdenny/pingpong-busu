create or replace function public.claim_source_request(
  p_source_code text,
  p_query_key text,
  p_min_interval_ms integer
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id bigint;
  v_now timestamptz := clock_timestamp();
  v_claimed_at timestamptz;
  v_source_last_attempt_at timestamptz;
  v_throttle public.source_request_throttles%rowtype;
  v_interval_ms integer := case
    when p_source_code = 'iping' then 60000
    else greatest(5000, least(coalesce(p_min_interval_ms, 5000), 60000))
  end;
  v_window interval := interval '1 minute';
begin
  if char_length(trim(coalesce(p_query_key, ''))) = 0 then
    return v_interval_ms;
  end if;

  select id, last_attempt_at
  into v_source_id, v_source_last_attempt_at
  from public.sources
  where code = p_source_code and enabled = true
  for update;

  if v_source_id is null then return v_interval_ms; end if;

  if p_source_code = 'iping'
    and v_source_last_attempt_at is not null
    and v_source_last_attempt_at > v_now - (v_interval_ms * interval '1 millisecond') then
    return greatest(1, ceil(extract(epoch from (
      v_source_last_attempt_at
        + (v_interval_ms * interval '1 millisecond')
        - clock_timestamp()
    )) * 1000)::integer);
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
    update public.sources
    set last_attempt_at = v_claimed_at, updated_at = v_claimed_at
    where id = v_source_id;
    return 0;
  end if;

  select * into v_throttle
  from public.source_request_throttles
  where source_id = v_source_id and query_key = p_query_key;

  if v_throttle.attempt_count >= 4
    and v_throttle.window_started_at > v_now - v_window then
    return greatest(1, ceil(extract(epoch from (
      v_throttle.window_started_at + v_window - clock_timestamp()
    )) * 1000)::integer);
  end if;

  return greatest(1, ceil(extract(epoch from (
    v_throttle.last_attempt_at
      + (v_interval_ms * interval '1 millisecond')
      - clock_timestamp()
  )) * 1000)::integer);
end;
$$;

revoke all on function public.claim_source_request(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_source_request(text, text, integer)
  to service_role;

comment on function public.claim_source_request(text, text, integer) is
  'Claims a source/query request with bounded retries and a source-wide interval for authenticated iPing requests.';
