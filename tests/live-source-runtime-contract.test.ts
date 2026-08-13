import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130005_live_source_failure_state.sql",
  ),
  "utf8",
);
const refreshPlayer = readFileSync(
  resolve(process.cwd(), "supabase/functions/refresh-player/index.ts"),
  "utf8",
);
const manualCrawlWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/crawl-manual.yml"),
  "utf8",
);
const manualCrawlScript = readFileSync(
  resolve(process.cwd(), "scripts/crawl.ts"),
  "utf8",
);

describe("live source database contract", () => {
  it("claims iPing requests by source and normalized query without a source-wide lock", () => {
    expect(migration).toContain("source_id, query_key");
    expect(migration).toContain("greatest(5000");
    expect(migration).toContain("v_interval_ms * interval '1 millisecond'");
    expect(migration).not.toContain("v_source_last_attempt_at");
    expect(migration).not.toContain("when p_source_code = 'iping' then 60000");
  });

  it("caps distinct iPing names with an atomic account-wide minute budget", () => {
    expect(migration).toContain("source_request_budgets");
    expect(migration).toContain("v_source_budget_limit integer := 6");
    expect(migration).toMatch(/where source_id = v_source_id\s+for update;/u);
    expect(migration).toContain(
      "v_source_budget.attempt_count >= v_source_budget_limit",
    );
    expect(migration).toContain("set attempt_count = attempt_count + 1");
    expect(migration).toContain(
      "revoke all on table public.source_request_budgets from public, anon, authenticated",
    );
  });

  it("persists only allow-listed failure codes and clears them on success", () => {
    expect(migration).toContain("record_source_refresh_failure");
    expect(migration).toContain("record_source_refresh_success");
    expect(migration).toContain("p_error_code = any");
    expect(migration).toContain("last_error_code = null");
    expect(migration).not.toContain("p_error_message");
    expect(migration).not.toContain("p_raw_error");
  });

  it("keeps claim and diagnostic transitions private to the service role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.claim_source_request/su,
    );
    expect(migration).toMatch(
      /revoke all on function public\.record_source_refresh_failure/su,
    );
    expect(migration).toMatch(
      /revoke all on function public\.record_source_refresh_success/su,
    );
    expect(migration.match(/to service_role/g)).toHaveLength(3);
  });
});

describe("refresh-player live source contract", () => {
  it("performs one bounded Airping request and returns deterministic timeout cooldown", () => {
    expect(refreshPlayer).toContain("const airpingRetryAfterMs = 5_000");
    expect(refreshPlayer).toMatch(
      /sourceCode === "airping"[\s\S]+?timeoutMs: 5_000, maxAttempts: 1/,
    );
    expect(refreshPlayer).not.toContain(
      "{ timeoutMs: 16_000, maxAttempts: 2, retryDelayMs: 250 }",
    );
    expect(refreshPlayer).toContain("retryAfterMs: airpingRetryAfterMs");
  });

  it("records sanitized failures and explicit successful recovery", () => {
    expect(refreshPlayer).toContain("record_source_refresh_failure");
    expect(refreshPlayer).toContain("record_source_refresh_success");
    expect(refreshPlayer).not.toContain("p_error_message:");
    expect(refreshPlayer).not.toContain("p_raw_error:");
  });
});

describe("manual live crawl input boundary", () => {
  it("avoids production environment access and shell interpolation of dispatch strings", () => {
    expect(manualCrawlWorkflow).not.toContain("environment: production");
    expect(manualCrawlWorkflow).not.toContain("IPING_PASSWORD");
    expect(manualCrawlWorkflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(manualCrawlWorkflow).toContain('run: pnpm crawl:live --query "$CRAWL_QUERY"');
    expect(manualCrawlWorkflow).toContain("CRAWL_QUERY: ${{ inputs.query }}");
    expect(manualCrawlWorkflow).toContain("CRAWL_SOURCE: ${{ inputs.source }}");
    expect(manualCrawlWorkflow).toContain("CRAWL_MAX_PAGES: ${{ inputs.maxPages }}");
    expect(
      manualCrawlWorkflow.match(/CRAWLER_REDACT_QUERY: "true"/g),
    ).toHaveLength(2);
    expect(manualCrawlWorkflow).not.toMatch(/run:.*\$\{\{\s*inputs\./u);
    expect(manualCrawlScript).toContain(
      'process.env.CRAWLER_REDACT_QUERY === "true" ? "[redacted]" : query',
    );
    expect(manualCrawlScript.match(/query: reportedQuery/g)).toHaveLength(2);
  });
});
