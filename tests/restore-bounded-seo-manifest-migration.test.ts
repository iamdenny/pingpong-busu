import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608200002_restore_bounded_seo_manifest.sql",
  ),
  "utf8",
);

describe("restored bounded SEO manifest migration", () => {
  it("drops the per-player record snapshot that could not be enumerated", () => {
    expect(migration).toContain(
      "create or replace view public.public_player_seo_manifest",
    );
    for (const column of [
      "recent_observed_division",
      "recent_awards",
      "source_names",
      "last_checked_at",
    ])
      expect(migration).not.toContain(`) ${column}`);
    expect(migration).not.toContain("effective_division_system");
    expect(migration).not.toContain("public.tournaments");
    expect(migration).not.toContain("limit 5");
  });

  it("keeps the bounded identity columns and the anon grant", () => {
    for (const column of [
      "canonical_name",
      "homonym_nickname",
      "primary_region",
      "primary_club",
      "result_count",
      "source_count",
    ])
      expect(migration).toContain(column);
    expect(migration).toContain(
      "grant select on public.public_player_seo_manifest to anon",
    );
    expect(migration).toContain("spi.match_status <> 'disputed'");
    expect(migration).toContain("p.merged_into_player_id is null");
  });
});
