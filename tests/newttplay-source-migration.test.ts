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
const budgetMigration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608140003_newttplay_global_request_budget.sql",
  ),
  "utf8",
);
const enableMigration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608150004_enable_newttplay_source.sql",
  ),
  "utf8",
);

describe("NewTTPlay source migration", () => {
  it("registers the source as a disabled HTTP adapter before explicit opt-in", () => {
    expect(migration).toContain("'newttplay'");
    expect(migration).toContain("'newttplay-1'");
    expect(migration).toMatch(/'http',\s*false,\s*'newttplay-1'/u);
  });

  it("does not enable an existing catalog row on conflict", () => {
    const updateClause = migration.slice(migration.indexOf("on conflict"));
    expect(updateClause).not.toMatch(/enabled\s*=/u);
  });

  it("adds NewTTPlay to the source-wide request budget", () => {
    expect(budgetMigration).toContain("array['iping', 'newttplay']");
    expect(budgetMigration).toContain("v_source_budget_limit integer := 6");
  });

  it("enables the catalog row after the operating approval", () => {
    expect(enableMigration).toMatch(
      /update public\.sources[\s\S]*enabled = true[\s\S]*where code = 'newttplay'/u,
    );
  });
});
