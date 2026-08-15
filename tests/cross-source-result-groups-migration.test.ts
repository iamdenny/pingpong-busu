import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608150005_cross_source_result_groups.sql",
  ),
  "utf8",
);

describe("cross-source result grouping migration", () => {
  it("creates conservative grouped public views without mutating raw results", () => {
    expect(migration).toContain(
      "create or replace view public.public_result_groups",
    );
    expect(migration).toContain("create or replace view public.public_results");
    expect(migration).toContain("fingerprint_source_collision = 1");
    expect(migration).toContain("p_tournament_date is null");
    expect(migration).toContain("!~ '(남자|여자|여성|혼성|혼합)'");
    expect(migration).not.toMatch(/update\s+public\.results/iu);
    expect(migration).not.toMatch(/delete\s+from\s+public\.results/iu);
    expect(migration).not.toContain("drop view public.public_results");
  });

  it("preserves every source URL and uses grouped rows for summaries", () => {
    expect(migration).toContain("'original_record_id', keyed.id");
    expect(migration).toContain("'source_url', keyed.source_url");
    expect(migration).toContain("left join public.public_result_groups r");
    expect(migration).toContain("'source_count', r.grouped_result_count");
  });
});
