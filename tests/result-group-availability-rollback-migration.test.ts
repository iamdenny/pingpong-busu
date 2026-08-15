import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608150007_restore_result_view_availability.sql",
  ),
  "utf8",
);

describe("result group availability rollback migration", () => {
  it("preserves the public grouped contract without unbounded window work", () => {
    expect(migration).toContain(
      "create or replace view public.public_result_groups",
    );
    expect(migration).toContain("'result:' || r.id::text result_fingerprint");
    expect(migration).toContain("jsonb_build_array(jsonb_build_object(");
    expect(migration).toContain("1::integer grouped_result_count");
    expect(migration).not.toMatch(/\bover\s*\(/iu);
    expect(migration).not.toMatch(/group\s+by/iu);
  });

  it("keeps disputed identities and records out of public results", () => {
    expect(migration).toContain("spi.match_status <> 'disputed'");
    expect(migration).toContain("r.record_status <> 'disputed'");
    expect(migration).toContain(
      "grant select on public.public_result_groups, public.public_results to anon",
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
