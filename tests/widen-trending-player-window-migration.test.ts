import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608210004_widen_trending_player_window.sql",
  ),
  "utf8",
);

describe("widened trending player window migration", () => {
  it("ranks a thirty day window instead of a single day", () => {
    expect(migration).toContain(
      "where v.bucket_start >= now() - interval '30 days'",
    );
    expect(migration).not.toContain("interval '23 hours'");
  });

  it("keeps a threshold that two clicks cannot reach", () => {
    expect(migration).toContain("having sum(v.unique_sessions) >= 3");
    expect(migration).toContain("limit 10");
  });

  it("does not keep origin markers any longer than before", () => {
    expect(migration).toContain(
      "delete from public.player_view_origins\n  where bucket_start < now() - interval '25 hours'",
    );
    expect(migration).toContain(
      "delete from public.player_view_counts\n  where bucket_start < now() - interval '31 days'",
    );
  });

  it("keeps the ranking free of merged players and view counts", () => {
    expect(migration).toContain("p.merged_into_player_id is null");
    expect(migration).not.toContain("total_sessions,");
  });
});
