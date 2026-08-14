import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608140005_integrated_local_event_ranges.sql",
  ),
  "utf8",
);

describe("integrated local event range migration", () => {
  it("reclassifies tilde regional event ranges as integrated", () => {
    expect(migration).toContain("set division_system = 'integrated'");
    expect(migration).toContain("[~～]");
    expect(migration).toContain("division_system is distinct from 'division'");
  });

  it("reapplies confirmed regional tournament overrides afterward", () => {
    const integratedUpdate = migration.indexOf("set division_system = 'integrated'");
    const regionalUpdate = migration.indexOf("set division_system = 'regional'");
    expect(regionalUpdate).toBeGreaterThan(integratedUpdate);
    expect(migration).toContain("제([1-9]|1[0-6])회분당구청장기");
    expect(migration).toContain("제18회분당구청장기탁구대회");
  });
});
