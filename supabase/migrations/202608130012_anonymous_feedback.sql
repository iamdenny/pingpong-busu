create type public.feedback_report_status as enum ('pending', 'delivering', 'published', 'failed', 'delivery_unknown');

create table public.feedback_reports (
  submission_id uuid primary key,
  category text not null check (category in ('inquiry', 'data_correction', 'bug', 'feature')),
  message text check (message is null or char_length(message) between 10 and 2000),
  page_url text check (
    page_url is null
    or (char_length(page_url) <= 2048 and page_url ~ '^https?://')
  ),
  app_version text not null check (char_length(app_version) between 1 and 32),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  language text check (language is null or char_length(language) <= 35),
  viewport_width integer check (viewport_width is null or viewport_width between 1 and 10000),
  viewport_height integer check (viewport_height is null or viewport_height between 1 and 10000),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status public.feedback_report_status not null default 'pending',
  issue_number bigint check (issue_number is null or issue_number > 0),
  issue_url text check (
    issue_url is null
    or (
      char_length(issue_url) <= 2048
      and issue_url ~ '^https://github[.]com/iamdenny/pingpong-busu/issues/[1-9][0-9]*$'
    )
  ),
  delivery_token uuid,
  delivery_lease_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text check (
    last_error_code is null
    or (
      char_length(last_error_code) between 1 and 64
      and last_error_code ~ '^[a-z0-9_]+$'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  failed_at timestamptz,
  constraint feedback_reports_transient_payload check (
    status = 'published'
    or (
      message is not null
      and page_url is not null
      and user_agent is not null
      and language is not null
      and viewport_width is not null
      and viewport_height is not null
    )
  ),
  constraint feedback_reports_published_issue check (
    (status = 'published') = (issue_number is not null and issue_url is not null)
  ),
  constraint feedback_reports_published_redaction check (
    status <> 'published'
    or (
      message is null
      and page_url is null
      and user_agent is null
      and language is null
      and viewport_width is null
      and viewport_height is null
      and delivery_token is null
      and delivery_lease_until is null
    )
  )
);

create index feedback_reports_global_budget_idx
on public.feedback_reports(created_at desc);

create index feedback_reports_delivery_queue_idx
on public.feedback_reports(status, delivery_lease_until, created_at);

alter table public.feedback_reports enable row level security;

revoke all on public.feedback_reports from public, anon, authenticated;

create or replace function public.reserve_feedback_submission_internal(
  p_submission_id uuid,
  p_category text,
  p_message text,
  p_page_url text,
  p_app_version text,
  p_user_agent text,
  p_language text,
  p_viewport_width integer,
  p_viewport_height integer,
  p_payload_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.feedback_reports%rowtype;
  v_global_count integer;
  v_daily_count integer;
begin
  if p_submission_id is null
    or p_category not in ('inquiry', 'data_correction', 'bug', 'feature')
    or p_message is null
    or char_length(p_message) not between 10 and 2000
    or p_page_url is null
    or char_length(p_page_url) > 2048
    or p_page_url !~ '^https?://'
    or p_app_version is null
    or char_length(p_app_version) not between 1 and 32
    or p_user_agent is null
    or char_length(p_user_agent) < 1
    or char_length(coalesce(p_user_agent, '')) > 512
    or p_language is null
    or char_length(p_language) < 1
    or char_length(coalesce(p_language, '')) > 35
    or p_viewport_width is null
    or p_viewport_width not between 1 and 10000
    or p_viewport_height is null
    or p_viewport_height not between 1 and 10000
    or p_payload_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_feedback_submission';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('feedback-submission:' || p_submission_id::text, 0)
  );

  select report.*
  into v_existing
  from public.feedback_reports report
  where submission_id = p_submission_id;

  if found then
    if v_existing.payload_hash <> p_payload_hash then
      raise exception 'feedback_submission_conflict';
    end if;

    return jsonb_build_object(
      'created', false,
      'submission_id', v_existing.submission_id,
      'status', v_existing.status,
      'issue_number', v_existing.issue_number,
      'issue_url', v_existing.issue_url
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('feedback-global-budget', 0)
  );
  select count(*)
  into v_global_count
  from public.feedback_reports
  where created_at >= now() - interval '10 minutes';

  if v_global_count >= 10 then
    raise exception 'feedback_rate_limited';
  end if;

  select count(*)
  into v_daily_count
  from public.feedback_reports
  where created_at >= now() - interval '1 day';

  if v_daily_count >= 50 then
    raise exception 'feedback_rate_limited';
  end if;

  insert into public.feedback_reports(
    submission_id,
    category,
    message,
    page_url,
    app_version,
    user_agent,
    language,
    viewport_width,
    viewport_height,
    payload_hash
  ) values (
    p_submission_id,
    p_category,
    p_message,
    p_page_url,
    p_app_version,
    nullif(p_user_agent, ''),
    nullif(p_language, ''),
    p_viewport_width,
    p_viewport_height,
    p_payload_hash
  );

  return jsonb_build_object(
    'created', true,
    'submission_id', p_submission_id,
    'status', 'pending'
  );
end;
$$;

create or replace function public.claim_feedback_delivery_internal(
  p_submission_id uuid,
  p_payload_hash text,
  p_delivery_token uuid,
  p_lease_seconds integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.feedback_reports%rowtype;
  v_previous_status public.feedback_report_status;
begin
  if p_submission_id is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_delivery_token is null
    or p_lease_seconds not between 15 and 300
  then
    raise exception 'invalid_feedback_delivery_claim';
  end if;

  select report.*
  into v_report
  from public.feedback_reports report
  where report.submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'feedback_submission_not_found';
  end if;
  if v_report.payload_hash <> p_payload_hash then
    raise exception 'feedback_submission_conflict';
  end if;
  if v_report.status = 'published' then
    return jsonb_build_object(
      'claimed', false,
      'status', v_report.status,
      'issue_number', v_report.issue_number,
      'issue_url', v_report.issue_url
    );
  end if;
  if v_report.status = 'delivering'
    and v_report.delivery_lease_until >= now()
  then
    return jsonb_build_object('claimed', false, 'status', v_report.status);
  end if;
  if v_report.status not in ('pending', 'failed', 'delivery_unknown')
    and not (
      v_report.status = 'delivering'
      and v_report.delivery_lease_until < now()
    )
  then
    raise exception 'feedback_delivery_not_claimable';
  end if;

  v_previous_status := v_report.status;
  update public.feedback_reports
  set status = 'delivering',
    delivery_token = p_delivery_token,
    delivery_lease_until = now() + pg_catalog.make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    last_error_code = null,
    updated_at = now()
  where submission_id = p_submission_id;

  return jsonb_build_object(
    'claimed', true,
    'status', 'delivering',
    'previous_status', v_previous_status,
    'delivery_token', p_delivery_token
  );
end;
$$;

create or replace function public.finalize_feedback_delivery_internal(
  p_submission_id uuid,
  p_delivery_token uuid,
  p_issue_number bigint,
  p_issue_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.feedback_reports%rowtype;
begin
  if p_submission_id is null
    or p_delivery_token is null
    or p_issue_number <= 0
    or char_length(p_issue_url) > 2048
    or p_issue_url !~ '^https://github[.]com/iamdenny/pingpong-busu/issues/[1-9][0-9]*$'
  then
    raise exception 'invalid_feedback_delivery_result';
  end if;

  select report.*
  into v_report
  from public.feedback_reports report
  where report.submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'feedback_submission_not_found';
  end if;
  if v_report.status = 'published' then
    if v_report.issue_number <> p_issue_number or v_report.issue_url <> p_issue_url then
      raise exception 'feedback_delivery_conflict';
    end if;
    return jsonb_build_object(
      'published', true,
      'issue_number', v_report.issue_number,
      'issue_url', v_report.issue_url
    );
  end if;
  if v_report.status <> 'delivering'
    or v_report.delivery_token is distinct from p_delivery_token
  then
    raise exception 'feedback_delivery_token_mismatch';
  end if;

  update public.feedback_reports
  set status = 'published',
    message = null,
    page_url = null,
    user_agent = null,
    language = null,
    viewport_width = null,
    viewport_height = null,
    issue_number = p_issue_number,
    issue_url = p_issue_url,
    delivery_token = null,
    delivery_lease_until = null,
    last_error_code = null,
    published_at = now(),
    failed_at = null,
    updated_at = now()
  where submission_id = p_submission_id;

  return jsonb_build_object(
    'published', true,
    'issue_number', p_issue_number,
    'issue_url', p_issue_url
  );
end;
$$;

create or replace function public.mark_feedback_delivery_internal(
  p_submission_id uuid,
  p_delivery_token uuid,
  p_outcome text,
  p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.feedback_report_status;
begin
  if p_submission_id is null
    or p_delivery_token is null
    or p_outcome not in ('failed', 'delivery_unknown')
    or char_length(p_error_code) not between 1 and 64
    or p_error_code !~ '^[a-z0-9_]+$'
  then
    raise exception 'invalid_feedback_delivery_failure';
  end if;

  select report.status
  into v_status
  from public.feedback_reports report
  where report.submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'feedback_submission_not_found';
  end if;
  if v_status <> 'delivering' or not exists (
    select 1
    from public.feedback_reports report
    where report.submission_id = p_submission_id
      and report.delivery_token = p_delivery_token
  ) then
    raise exception 'feedback_delivery_token_mismatch';
  end if;

  update public.feedback_reports
  set status = p_outcome::public.feedback_report_status,
    delivery_token = null,
    delivery_lease_until = null,
    last_error_code = p_error_code,
    failed_at = case when p_outcome = 'failed' then now() else null end,
    updated_at = now()
  where submission_id = p_submission_id;

  return jsonb_build_object('marked', true, 'status', p_outcome);
end;
$$;

create or replace function public.redact_expired_feedback_internal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redacted integer;
begin
  delete from public.feedback_reports
  where created_at < now() - interval '30 days'
    and (
      status in ('pending', 'failed', 'delivery_unknown')
      or (
        status = 'delivering'
        and coalesce(delivery_lease_until, created_at) < now()
      )
    );

  get diagnostics v_redacted = row_count;
  return v_redacted;
end;
$$;

revoke all on function public.reserve_feedback_submission_internal(uuid, text, text, text, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.reserve_feedback_submission_internal(uuid, text, text, text, text, text, text, integer, integer, text) to service_role;

revoke all on function public.claim_feedback_delivery_internal(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_feedback_delivery_internal(uuid, text, uuid, integer) to service_role;

revoke all on function public.finalize_feedback_delivery_internal(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.finalize_feedback_delivery_internal(uuid, uuid, bigint, text) to service_role;

revoke all on function public.mark_feedback_delivery_internal(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_feedback_delivery_internal(uuid, uuid, text, text) to service_role;

revoke all on function public.redact_expired_feedback_internal() from public, anon, authenticated;
grant execute on function public.redact_expired_feedback_internal() to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'redact-expired-anonymous-feedback',
  '17 3 * * *',
  $$select public.redact_expired_feedback_internal();$$
);

comment on table public.feedback_reports is
  'Private anonymous feedback delivery outbox. Raw request origins are never stored.';
comment on column public.feedback_reports.payload_hash is
  'SHA-256 digest of the validated canonical submission payload used for idempotency conflict detection.';
