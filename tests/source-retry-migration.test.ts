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
