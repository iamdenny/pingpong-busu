import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130012_anonymous_feedback.sql",
  ),
  "utf8",
);

describe("anonymous feedback migration", () => {
  it("stores a bounded private feedback delivery contract", () => {
    expect(migration).toContain("create table public.feedback_reports");
    expect(migration).toContain(
      "'pending', 'delivering', 'published', 'failed', 'delivery_unknown'",
    );
    expect(migration).toContain(
      "'inquiry', 'data_correction', 'bug', 'feature'",
    );
    expect(migration).toContain("char_length(message) between 10 and 2000");
    expect(migration).toContain("char_length(page_url) <= 2048");
    expect(migration).toMatch(
      /char_length\(app_version\) (?:between 1 and 32|<= 32)/u,
    );
    expect(migration).toContain("char_length(user_agent) <= 512");
    expect(migration).toContain("char_length(language) <= 35");
    expect(migration).toContain("viewport_width between 1 and 10000");
    expect(migration).toContain("viewport_height between 1 and 10000");
    expect(migration).toContain("payload_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("delivery_lease_until");
    expect(migration).toContain("attempt_count");
    expect(migration).toContain("and user_agent is not null");
    expect(migration).toContain("and language is not null");
    expect(migration).toContain("and viewport_width is not null");
    expect(migration).toContain("and viewport_height is not null");
    expect(migration).not.toContain("correction_requests");
  });

  it("reserves idempotently before applying atomic rate budgets", () => {
    expect(migration).toContain("reserve_feedback_submission_internal");
    expect(migration).toContain("feedback_submission_conflict");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("created_at >= now() - interval '10 minutes'");
    expect(migration).toContain("v_global_count >= 10");
    expect(migration).toContain("created_at >= now() - interval '1 day'");
    expect(migration).toContain("v_daily_count >= 50");
    expect(migration).toMatch(
      /select[\s\S]+from public\.feedback_reports[\s\S]+where submission_id = p_submission_id[\s\S]+v_global_count/iu,
    );
  });

  it("leases delivery and distinguishes confirmed from ambiguous failures", () => {
    expect(migration).toContain("claim_feedback_delivery_internal");
    expect(migration).toContain("status = 'delivering'");
    expect(migration).toMatch(/delivery_lease_until\s*<\s*now\(\)/u);
    expect(migration).toContain("attempt_count = attempt_count + 1");
    expect(migration).toContain("mark_feedback_delivery_internal");
    expect(migration).toContain("'failed', 'delivery_unknown'");
    expect(migration).toContain("feedback_delivery_token_mismatch");
  });

  it("publishes issue metadata and removes transient client context", () => {
    expect(migration).toContain("finalize_feedback_delivery_internal");
    expect(migration).toContain("status = 'published'");
    expect(migration).toContain("message = null");
    expect(migration).toContain("page_url = null");
    expect(migration).toContain("user_agent = null");
    expect(migration).toContain("language = null");
    expect(migration).toContain("viewport_width = null");
    expect(migration).toContain("viewport_height = null");
    expect(migration).toContain("issue_number = p_issue_number");
    expect(migration).toContain("issue_url = p_issue_url");
    expect(migration).toContain("payload_hash text not null");
  });

  it("keeps tables and mutation RPCs service-role only", () => {
    expect(migration).toContain(
      "revoke all on public.feedback_reports from public, anon, authenticated",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete).*feedback_reports.*(?:anon|authenticated)/iu,
    );
    for (const functionName of [
      "reserve_feedback_submission_internal",
      "claim_feedback_delivery_internal",
      "finalize_feedback_delivery_internal",
      "mark_feedback_delivery_internal",
    ]) {
      expect(migration).toContain(
        `revoke all on function public.${functionName}`,
      );
      expect(migration).toMatch(
        new RegExp(
          `grant execute on function public\\.${functionName}\\([\\s\\S]+?to service_role`,
          "u",
        ),
      );
    }
    expect(migration).toContain("redact_expired_feedback_internal");
    expect(migration).toContain("created_at < now() - interval '30 days'");
    expect(migration).toContain(
      "status in ('pending', 'failed', 'delivery_unknown')",
    );
    expect(migration).toContain("status = 'delivering'");
    expect(migration).toContain("create extension if not exists pg_cron");
    expect(migration).toContain("redact-expired-anonymous-feedback");
    expect(migration).toContain(
      "revoke all on function public.redact_expired_feedback_internal() from public, anon, authenticated",
    );
  });
});
