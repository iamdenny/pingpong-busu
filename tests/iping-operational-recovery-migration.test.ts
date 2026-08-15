import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608150010_iping_operational_recovery.sql",
  ),
  "utf8",
);

describe("iPing operational recovery migration", () => {
  it("serializes recovery with enqueue and preserves running work", () => {
    expect(migration).toContain("recover_iping_refresh_job");
    expect(migration).toContain(
      "pg_advisory_xact_lock(hashtextextended('iping_refresh_enqueue', 0))",
    );
    expect(migration).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\('iping_refresh_enqueue', 0\)\)[\s\S]+?pg_advisory_xact_lock\(hashtextextended\('iping_refresh_claim', 0\)\)/u,
    );
    expect(migration).toMatch(
      /status = 'running'[\s\S]+?return jsonb_build_object\('status', 'busy', 'jobId', v_running_job_id\)[\s\S]+?status = 'pending'/u,
    );
    expect(migration).toMatch(
      /status = 'pending'[\s\S]+?deterministic_failure_count = 0[\s\S]+?return jsonb_build_object\(\s*'status', 'already_pending',\s*'jobId', v_pending_job_id\s*\)/u,
    );
  });

  it("requeues only one recent deterministic failure and resets its state", () => {
    expect(migration).toContain("completed_at >= v_now - interval '24 hours'");
    for (const errorCode of [
      "source_auth_failed",
      "source_schema_changed",
      "source_blocked",
      "source_not_configured",
    ]) {
      expect(migration).toContain(`'${errorCode}'`);
    }
    expect(migration).toContain(
      "order by completed_at desc nulls last, id desc",
    );
    expect(migration).toContain(
      "job.query_payload = jsonb_build_object(\n      'name', job.query_payload -> 'name'",
    );
    expect(migration).toContain(
      "char_length(trim(job.query_payload ->> 'name')) between 2 and 30",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("limit 1");
    expect(migration).toMatch(
      /set status = 'pending'[\s\S]+?requested_at = v_now[\s\S]+?started_at = null[\s\S]+?completed_at = null[\s\S]+?attempt_count = 0[\s\S]+?next_attempt_at = v_now[\s\S]+?last_error_code = null[\s\S]+?source_refresh_id = null[\s\S]+?lease_token = null[\s\S]+?lease_expires_at = null/u,
    );
    expect(migration).not.toMatch(
      /set status = 'pending'[\s\S]+?refresh_bucket\s*=/u,
    );
  });

  it("returns a bounded reset-only result when no eligible job exists", () => {
    expect(migration).toMatch(
      /if v_failed_job_id is null then[\s\S]+?deterministic_failure_count = 0[\s\S]+?return jsonb_build_object\('status', 'reset_only'\)/u,
    );
    expect(migration).toContain("deterministic_failure_count = 0");
    expect(migration).toContain("circuit_open_until = null");
    expect(migration).toMatch(
      /return jsonb_build_object\(\s*'status', 'requeued',\s*'jobId', v_failed_job_id\s*\)/u,
    );
  });

  it("keeps recovery service-role-only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.recover_iping_refresh_job\(\)\s+from public, anon, authenticated/u,
    );
    expect(migration).toMatch(
      /grant execute on function public\.recover_iping_refresh_job\(\)\s+to service_role/u,
    );
  });
});
