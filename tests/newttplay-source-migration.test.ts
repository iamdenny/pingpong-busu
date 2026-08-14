import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608140002_newttplay_source.sql",
  ),
  "utf8",
);

describe("NewTTPlay source migration", () => {
  it("registers the source as a disabled HTTP adapter", () => {
    expect(migration).toContain("'newttplay'");
    expect(migration).toContain("'newttplay-1'");
    expect(migration).toMatch(/'http',\s*false,\s*'newttplay-1'/u);
  });

  it("does not enable an existing catalog row on conflict", () => {
    const updateClause = migration.slice(migration.indexOf("on conflict"));
    expect(updateClause).not.toMatch(/enabled\s*=/u);
  });
});
