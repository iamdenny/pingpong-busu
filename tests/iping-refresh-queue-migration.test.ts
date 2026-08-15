import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608150005_iping_refresh_queue.sql",
  ),
  "utf8",
);

describe("iPing refresh queue migration", () => {
  it("adds bounded leases and refresh provenance to refresh jobs", () => {
    expect(migration).toContain("add column if not exists lease_token uuid");
    expect(migration).toContain(
      "add column if not exists lease_expires_at timestamptz",
    );
    expect(migration).toContain(
      "add column if not exists source_refresh_id bigint references public.source_refreshes(id)",
    );
    expect(migration).toContain("refresh_jobs_iping_claim_idx");
    expect(migration).toContain("refresh_jobs_lease_pair_check");
    expect(migration).not.toContain("refresh_jobs_attempt_count_check");
    expect(migration).not.toContain("refresh_jobs_payload_name_check");
  });

  it("enqueues only a bounded, deduplicated and non-fresh iPing query", () => {
    expect(migration).toContain("enqueue_iping_refresh_job");
    expect(migration).toContain("char_length(v_query_name) between 2 and 30");
    expect(migration).toContain("char_length(v_query_key) between 1 and 50");
    expect(migration).toContain("interval '6 hours'");
    expect(migration).toContain("jsonb_build_object('name', v_query_name)");
    expect(migration).toContain(
      "job.query_payload = jsonb_build_object(\n      'name', job.query_payload -> 'name'",
    );
    expect(migration).toContain("status in ('pending', 'running')");
    expect(migration).toContain("v_active_count >= 12");
    expect(migration).toContain("queue_enqueue_count >= 4");
    expect(migration).toContain(
      "queue_window_started_at + interval '1 minute'",
    );
    expect(migration).toContain("v_origin_budget_count >= 256");
    expect(migration).toContain("'status', 'origin_limited'");
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain("iping_refresh_enqueue_budgets");
    expect(migration).toMatch(
      /if v_active_count >= 12[\s\S]+?select \* into v_origin_budget[\s\S]+?insert into public\.refresh_jobs[\s\S]+?insert into public\.iping_refresh_enqueue_budgets/u,
    );
    expect(migration).toMatch(
      /enqueue_iping_refresh_job[\s\S]+?requested_at < v_now - interval '24 hours'[\s\S]+?select id[\s\S]+?from public\.refresh_jobs/u,
    );
    expect(migration).toContain("'status', 'queued'");
    expect(migration).toContain("'status', 'fresh'");
    expect(migration).toContain("'status', 'source_disabled'");
    expect(migration).toContain("'status', 'source_unavailable'");
    expect(migration).toContain("'status', 'queue_full'");
    expect(migration).toContain("'status', 'cooldown'");
  });

  it("claims one oldest job atomically with an expiring lease", () => {
    expect(migration).toContain("claim_iping_refresh_job");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("order by requested_at, id");
    expect(migration).toContain("interval '4 minutes'");
    expect(migration).toContain("attempt_count < 3");
    expect(migration).toContain("circuit_open_until > v_now");
    expect(migration).toContain("lease_expires_at <= v_now");
    expect(migration).toContain(
      "lease_expires_at is null or lease_expires_at <= v_now",
    );
    expect(migration).toMatch(
      /claim_iping_refresh_job[\s\S]+?requested_at < v_now - interval '24 hours'[\s\S]+?source_queue_expired/u,
    );
  });

  it("resolves success, bounded transient retries, and terminal kill-switch failures", () => {
    expect(migration).toContain("resolve_iping_refresh_job");
    expect(migration).toContain("p_refresh_id bigint default null");
    expect(migration).toContain("p_error_code text default null");
    expect(migration).toContain("p_retry_after_ms integer default null");
    expect(migration).toContain("least(3600000, greatest(900000");
    expect(migration).toContain("attempt_count < 3");
    expect(migration).toContain("source_timeout");
    expect(migration).toContain("source_request_failed");
    expect(migration).toContain("source_rate_limited");
    expect(migration).toContain("source_auth_failed");
    expect(migration).toContain("source_schema_changed");
    expect(migration).toContain("source_blocked");
    expect(migration).toContain("source_not_configured");
    expect(migration).not.toMatch(
      /v_is_transient :=[\s\S]+?'source_refresh_failed'[\s\S]+?v_is_kill_switch :=/u,
    );
    expect(migration).toContain("last_error_code = 'source_backlog_stopped'");
    expect(migration).toContain("lease_token = p_lease_token");
    expect(migration).toMatch(
      /resolve_iping_refresh_job[\s\S]+?pg_advisory_xact_lock\(hashtextextended\('iping_refresh_enqueue'/u,
    );
  });

  it("purges bounded history and schedules daily maintenance", () => {
    expect(migration).toContain("purge_iping_refresh_jobs");
    expect(migration).toContain("requested_at < v_now - interval '24 hours'");
    expect(migration).toContain("completed_at < v_now - interval '7 days'");
    expect(migration).toContain("create extension if not exists pg_cron");
    expect(migration).toContain("cron.schedule");
    expect(migration).toContain("purge-iping-refresh-jobs");
  });

  it("keeps queue RPCs service-role-only and advances the parser contract", () => {
    for (const signature of [
      "enqueue_iping_refresh_job(text, text, text)",
      "claim_iping_refresh_job(uuid)",
      "resolve_iping_refresh_job(bigint, uuid, bigint, text, integer)",
      "purge_iping_refresh_jobs()",
    ]) {
      expect(migration).toContain(
        `revoke all on function public.${signature} from public, anon, authenticated`,
      );
      expect(migration).toContain(
        `grant execute on function public.${signature} to service_role`,
      );
    }
    expect(migration).toContain("parser_version = 'iping-4'");
    expect(migration).not.toMatch(/cookie|credential|raw_html|raw_error/iu);
  });
});
