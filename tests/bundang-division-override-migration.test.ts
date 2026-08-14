import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608140004_bundang_18_regional_division_override.sql",
  ),
  "utf8",
);

describe("Bundang division override migration", () => {
  it("reclassifies only the confirmed 18th edition", () => {
    expect(migration).toContain("set division_system = 'regional'");
    expect(migration).toContain("제18회분당구청장기탁구대회");
    expect(migration).not.toContain("제17회분당구청장기");
    expect(migration).not.toMatch(/제\(\[1-9\]\|1\[0-8\]\)회/u);
  });
});
