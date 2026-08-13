import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130003_division_observation_counts.sql",
  ),
  "utf8",
);

describe("division observation count migration", () => {
  it("aggregates each division system and value independently", () => {
    expect(migration).toContain("division_observations");
    expect(migration).toContain(
      "group by coalesce(r2.division_system, 'unknown'), btrim(r2.division_value)",
    );
  });

  it("separates four-or-better awards from participation records", () => {
    expect(migration).toContain(
      "filter (where public.is_award_rank(r2.rank_text))",
    );
    expect(migration).toContain(
      "filter (where not public.is_award_rank(r2.rank_text))",
    );
  });

  it("excludes disputed and division-less records", () => {
    expect(migration).toContain("r2.record_status <> 'disputed'");
    expect(migration).toContain(
      "nullif(btrim(r2.division_value), '') is not null",
    );
  });
});
