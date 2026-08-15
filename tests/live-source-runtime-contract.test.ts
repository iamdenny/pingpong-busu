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
const reliabilityMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608140008_source_reliability.sql",
  ),
  "utf8",
);
const refreshPlayer = readFileSync(
  resolve(process.cwd(), "supabase/functions/refresh-player/index.ts"),
  "utf8",
);
const workerAuth = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/worker-auth.ts"),
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

  it("persists only allow-listed failure codes", () => {
    expect(migration).toContain("record_source_refresh_failure");
    expect(migration).toContain("p_error_code = any");
    expect(migration).not.toContain("p_error_message");
    expect(migration).not.toContain("p_raw_error");
    expect(migration).not.toContain("record_source_refresh_success");
  });

  it("keeps claim and diagnostic transitions private to the service role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.claim_source_request/su,
    );
    expect(migration).toMatch(
      /revoke all on function public\.record_source_refresh_failure/su,
    );
    expect(migration.match(/to service_role/g)).toHaveLength(2);
  });
});

describe("refresh-player live source contract", () => {
  it("separates browser queueing from a strongly authenticated worker drain", () => {
    expect(refreshPlayer).toContain('mode === "drain-iping"');
    expect(refreshPlayer).toContain('mode === "recover-iping"');
    expect(refreshPlayer).toContain("REFRESH_WORKER_TOKEN");
    expect(refreshPlayer).toContain("hasValidWorkerAuthorization");
    expect(refreshPlayer).toMatch(
      /if \(!workerAuthorized && !browserAuthorized\)[\s\S]+?unauthorized/u,
    );
    expect(refreshPlayer).toMatch(
      /client\.rpc\(\s*"enqueue_iping_refresh_job"/u,
    );
    expect(refreshPlayer).toMatch(/client\.rpc\(\s*"claim_iping_refresh_job"/u);
    expect(refreshPlayer).toMatch(
      /client\.rpc\(\s*"resolve_iping_refresh_job"/u,
    );
    expect(refreshPlayer).toMatch(
      /client\.rpc\(\s*"recover_iping_refresh_job"/u,
    );
    expect(refreshPlayer).toContain('status: "queued"');
    expect(refreshPlayer).toContain("아이핑 최신 기록 수집을 예약했습니다.");
    expect(refreshPlayer).toContain('iping: "iping-4"');
    expect(refreshPlayer).toMatch(
      /resolution\.status === "retry_scheduled"[\s\S]+?status: 200[\s\S]+?counters\.failed = 1;[\s\S]+?status: 500/u,
    );
    expect(workerAuth).toContain("crypto.subtle.digest");
    expect(workerAuth).toContain("difference |=");
    expect(workerAuth).toContain("^[a-f0-9]{64}$");
    expect(refreshPlayer).toContain("isSafeIpingPlayerName(input.name)");
    expect(refreshPlayer).toContain("!isSafeIpingPlayerName(queryName)");
    expect(refreshPlayer).toContain("hashRequestOrigin");
    expect(refreshPlayer).toContain("p_scope_hash: requestOriginHash");
    expect(refreshPlayer).toContain('reason: "source_cooldown"');
  });

  it("checks the iPing runtime before mutating recovery state and drains only after recovery", () => {
    expect(refreshPlayer).toMatch(
      /function hasIpingRecoveryRuntime[\s\S]+?CRAWL_LIVE[\s\S]+?CRAWLER_SOURCE_IPING_ENABLED[\s\S]+?IPING_USERNAME[\s\S]+?IPING_PASSWORD/u,
    );
    expect(refreshPlayer).toMatch(
      /requestBody\.mode === "recover-iping"[\s\S]+?hasIpingRecoveryRuntime[\s\S]+?select\("enabled"\)[\s\S]+?recover_iping_refresh_job[\s\S]+?drainOneIpingJob/u,
    );
    expect(refreshPlayer).toMatch(
      /Object\.keys\(value\)\.length === 1[\s\S]+?recover-iping/u,
    );
    expect(refreshPlayer).toMatch(
      /recovery\.status === "busy" \|\| recovery\.status === "reset_only"[\s\S]+?409/u,
    );
    expect(refreshPlayer).toMatch(
      /requestBody\.mode === "recover-iping"[\s\S]+?outcome\.counters\.succeeded !== 1[\s\S]+?503/u,
    );
  });

  it("preserves deterministic iPing errors when diagnostics fail", () => {
    expect(refreshPlayer).toMatch(
      /outcomeError && !isIpingKillSwitchError\(safe\.code\)[\s\S]+?resolutionErrorCode = "source_refresh_failed"/u,
    );
    expect(refreshPlayer).toMatch(
      /catch \{[\s\S]+?if \(!isIpingKillSwitchError\(safe\.code\)\)[\s\S]+?resolutionErrorCode = "source_refresh_failed"/u,
    );
  });

  it("keeps iPing HTTP cookies separate from the mandatory form token", () => {
    expect(refreshPlayer).toMatch(
      /const headerCookie = ipingCookie\(loginPage\);[\s\S]+?const formSessionId = extractIpingSessionId\(loginPageHtml\);/u,
    );
    expect(refreshPlayer).toMatch(
      /const initialCookie =[\s\S]+?headerCookie \?\?[\s\S]+?extractIpingSessionCookie\(loginPageHtml\)/u,
    );
    expect(refreshPlayer).toContain("PHPSESSID: formSessionId");
    expect(refreshPlayer).not.toContain(
      "extractIpingSessionIdFromCookie(initialCookie) ??",
    );
  });

  it("treats only timeout, rate limits, network failures, and 5xx as retryable iPing work", () => {
    expect(refreshPlayer).toContain(
      "response.status === 408 || response.status >= 500",
    );
    expect(refreshPlayer).toContain('"source_request_failed"');
    expect(refreshPlayer).toMatch(
      /if \(!response\.ok\)[\s\S]+?"source_schema_changed"/u,
    );
  });

  it("never performs an iPing network fetch from a browser refresh", () => {
    expect(refreshPlayer).toMatch(
      /if \(sourceCode === "iping"\)[\s\S]+?enqueue_iping_refresh_job[\s\S]+?continue;/u,
    );
    expect(refreshPlayer).not.toMatch(
      /else if \(sourceCode === "iping"\)[\s\S]+?fetchIpingRecords\(input\.name/u,
    );
  });

  it("performs one bounded Airping request and returns deterministic timeout cooldown", () => {
    expect(refreshPlayer).toContain("const airpingRetryAfterMs = 5_000");
    expect(refreshPlayer).toMatch(
      /sourceCode === "airping"[\s\S]+?timeoutMs: 10_000, maxAttempts: 1/,
    );
    expect(refreshPlayer).not.toContain(
      "{ timeoutMs: 16_000, maxAttempts: 2, retryDelayMs: 250 }",
    );
    expect(refreshPlayer).toContain("retryAfterMs: airpingRetryAfterMs");
  });

  it("serializes authenticated iPing searches and records safe phases", () => {
    expect(refreshPlayer).not.toContain(
      'Promise.all([search("&B=Y"), search("&Ctype=A"), search("&Ctype=B")])',
    );
    expect(refreshPlayer).toContain('search("&B=Y", "entry_search")');
    expect(refreshPlayer).toMatch(
      /search\(\s*"&Ctype=A",\s*"nationwide_awards_search",?\s*\)/u,
    );
    expect(refreshPlayer).toMatch(
      /search\(\s*"&Ctype=B",\s*"district_awards_search",?\s*\)/u,
    );
    expect(refreshPlayer).toContain("record_source_request_outcome");
    expect(refreshPlayer).not.toContain("p_raw_response");
    expect(refreshPlayer).not.toMatch(
      /record_source_request_outcome[\s\S]{0,300}p_query_name/u,
    );
  });

  it("uses one atomic policy claim for source budgets and the iPing circuit", () => {
    expect(refreshPlayer).toContain("claim_source_request_with_policy");
    expect(refreshPlayer).not.toContain(
      'client.rpc("source_circuit_retry_after"',
    );
    expect(refreshPlayer).toContain('errorCode: "source_circuit_open"');
    expect(refreshPlayer).toContain('claimReason === "source_circuit_open"');
  });

  it("fails closed when the automatic cache lookup cannot be verified", () => {
    expect(refreshPlayer).toContain("error: freshError");
    expect(refreshPlayer).toMatch(
      /if \(freshError\)[\s\S]+?기존 조회 기록을 확인하지 못했습니다[\s\S]+?continue;/u,
    );
  });

  it("records sanitized failures and leaves successful recovery to the upsert transaction", () => {
    expect(refreshPlayer).toContain("record_source_refresh_failure");
    expect(refreshPlayer).not.toContain("record_source_refresh_success");
    expect(refreshPlayer).not.toContain("p_error_message:");
    expect(refreshPlayer).not.toContain("p_raw_error:");
    expect(refreshPlayer).toContain("error: outcomeError");
    expect(refreshPlayer).toContain("출처 보호 상태를 기록하지 못했습니다.");
    expect(refreshPlayer).toMatch(
      /try \{[\s\S]+?record_source_refresh_failure[\s\S]+?\} catch \{/u,
    );
    expect(refreshPlayer).toContain("reportOperationalIncident");
    expect(refreshPlayer).toContain('safe.code === "source_schema_changed"');
    expect(refreshPlayer).toContain('safe.code === "source_auth_failed"');
    expect(refreshPlayer).toContain("scheduleBackground(");
    expect(refreshPlayer).toContain("edgeRuntime.waitUntil");
    expect(refreshPlayer).not.toMatch(/await reportOperationalIncident\(/u);
  });
});

describe("source reliability database contract", () => {
  it("keeps privacy-safe diagnostics private and bounded", () => {
    expect(reliabilityMigration).toContain("source_request_diagnostics");
    expect(reliabilityMigration).toContain("record_source_request_outcome");
    expect(reliabilityMigration).toContain("p_phase");
    expect(reliabilityMigration).toContain("p_duration_ms");
    expect(reliabilityMigration).not.toContain("p_query_name");
    expect(reliabilityMigration).not.toContain("p_raw_response");
    expect(reliabilityMigration).toMatch(
      /revoke all on table public\.source_request_diagnostics from public, anon, authenticated/su,
    );
    expect(reliabilityMigration).toMatch(
      /error_code text check \(error_code is null or error_code = any/su,
    );
    expect(reliabilityMigration).toContain(
      "delete_expired_source_request_diagnostics",
    );
    expect(reliabilityMigration).toContain(
      "delete-expired-source-request-diagnostics",
    );
  });

  it("atomically applies source budgets and the iPing circuit", () => {
    expect(reliabilityMigration).toContain(
      "deterministic_failure_count + 1 >= 2",
    );
    expect(reliabilityMigration).toContain("interval '10 minutes'");
    expect(reliabilityMigration).toContain("claim_source_request_with_policy");
    expect(reliabilityMigration).toContain(
      "array['iping', 'newttplay', 'airping']",
    );
    expect(reliabilityMigration).toContain(
      "case when p_source_code = 'iping' then 2 else 6 end",
    );
    expect(reliabilityMigration).toContain("deterministic_failure_count = 0");
    expect(reliabilityMigration).toContain("circuit_open_until = null");
  });

  it("grants diagnostic and circuit RPCs only to the service role", () => {
    expect(reliabilityMigration).toMatch(
      /revoke all on function public\.record_source_request_outcome/su,
    );
    expect(reliabilityMigration).toMatch(
      /revoke all on function public\.claim_source_request_with_policy/su,
    );
    expect(reliabilityMigration.match(/to service_role/g)).toHaveLength(3);
  });
});

describe("manual live crawl input boundary", () => {
  it("avoids production environment access and shell interpolation of dispatch strings", () => {
    expect(manualCrawlWorkflow).not.toContain("environment: production");
    expect(manualCrawlWorkflow).not.toContain("IPING_PASSWORD");
    expect(manualCrawlWorkflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(manualCrawlWorkflow).toContain(
      'run: pnpm crawl:live --query "$CRAWL_QUERY"',
    );
    expect(manualCrawlWorkflow).toContain("CRAWL_QUERY: ${{ inputs.query }}");
    expect(manualCrawlWorkflow).toContain("CRAWL_SOURCE: ${{ inputs.source }}");
    expect(manualCrawlWorkflow).toContain(
      "CRAWL_MAX_PAGES: ${{ inputs.maxPages }}",
    );
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
