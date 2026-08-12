create or replace function public.claim_source_request(
  p_source_code text,
  p_min_interval_ms integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
  v_interval_ms integer := greatest(1000, least(coalesce(p_min_interval_ms, 2000), 60000));
begin
  update public.sources
  set last_attempt_at = clock_timestamp(), updated_at = clock_timestamp()
  where code = p_source_code
    and enabled = true
    and (
      last_attempt_at is null
      or last_attempt_at <= clock_timestamp() - (v_interval_ms * interval '1 millisecond')
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_source_request(text, integer) from public, anon, authenticated;
grant execute on function public.claim_source_request(text, integer) to service_role;
