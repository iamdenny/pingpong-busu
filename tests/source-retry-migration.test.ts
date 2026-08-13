import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130002_bounded_source_retries.sql",
  ),
  "utf8",
);
const ipingMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130004_iping_global_throttle.sql",
  ),
  "utf8",
);

describe("bounded source retry migration", () => {
  it("enforces a five-second minimum for each source and query", () => {
    expect(migration).toContain("greatest(5000");
    expect(migration).toContain("source_id, query_key");
    expect(migration).toContain("v_interval_ms * interval '1 millisecond'");
  });

  it("caps a one-minute window at four total attempts", () => {
    expect(migration).toContain("v_window interval := interval '1 minute'");
    expect(migration).toContain("throttle.attempt_count < 4");
    expect(migration).toContain("attempt_count between 1 and 4");
  });

  it("keeps the claim function private to the service role", () => {
    expect(migration).toContain(
      "revoke all on function public.claim_source_request",
    );
    expect(migration).toContain("to service_role");
  });
});

describe("authenticated iPing source throttle migration", () => {
  it("serializes iPing claims and enforces a source-wide interval", () => {
    expect(ipingMigration).toContain("select id, last_attempt_at");
    expect(ipingMigration).toContain("for update");
    expect(ipingMigration).toContain("p_source_code = 'iping'");
    expect(ipingMigration).toContain("when p_source_code = 'iping' then 60000");
    expect(ipingMigration).toContain("v_source_last_attempt_at > v_now");
  });

  it("keeps the claim function private to the service role", () => {
    expect(ipingMigration).toContain(
      "revoke all on function public.claim_source_request",
    );
    expect(ipingMigration).toContain("to service_role");
  });
});
