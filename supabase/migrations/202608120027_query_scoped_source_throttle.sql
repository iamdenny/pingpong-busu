create table if not exists public.source_request_throttles (
  source_id bigint not null references public.sources on delete cascade,
  query_key text not null check (char_length(query_key) between 1 and 100),
  last_attempt_at timestamptz not null default clock_timestamp(),
  primary key (source_id, query_key)
);

alter table public.source_request_throttles enable row level security;
revoke all on public.source_request_throttles from public, anon, authenticated;

drop function if exists public.claim_source_request(text, integer);

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
  v_last_attempt_at timestamptz;
  v_interval_ms integer := greatest(1000, least(coalesce(p_min_interval_ms, 2000), 60000));
begin
  if char_length(trim(coalesce(p_query_key, ''))) = 0 then
    return v_interval_ms;
  end if;

  select id
  into v_source_id
  from public.sources
  where code = p_source_code
    and enabled = true;

  if v_source_id is null then
    return v_interval_ms;
  end if;

  insert into public.source_request_throttles as throttle(source_id, query_key, last_attempt_at)
  values(v_source_id, p_query_key, v_now)
  on conflict (source_id, query_key) do update
  set last_attempt_at = excluded.last_attempt_at
  where throttle.last_attempt_at
    <= excluded.last_attempt_at - (v_interval_ms * interval '1 millisecond')
  returning last_attempt_at into v_claimed_at;

  if v_claimed_at is not null then
    update public.sources
    set last_attempt_at = v_claimed_at,
        updated_at = v_claimed_at
    where id = v_source_id;
    return 0;
  end if;

  select last_attempt_at
  into v_last_attempt_at
  from public.source_request_throttles
  where source_id = v_source_id
    and query_key = p_query_key;

  return greatest(
    1,
    ceil(
      extract(
        epoch from (
          v_last_attempt_at
          + (v_interval_ms * interval '1 millisecond')
          - clock_timestamp()
        )
      ) * 1000
    )::integer
  );
end;
$$;

revoke all on function public.claim_source_request(text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_source_request(text, text, integer) to service_role;
