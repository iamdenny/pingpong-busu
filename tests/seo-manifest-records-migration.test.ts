import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608200001_seo_manifest_records.sql",
  ),
  "utf8",
);

describe("SEO manifest record snapshot migration", () => {
  it("exposes the record columns the static pages render", () => {
    expect(migration).toContain(
      "create or replace view public.public_player_seo_manifest",
    );
    for (const column of [
      "recent_observed_division",
      "recent_observed_division_system",
      "recent_awards",
      "source_names",
      "last_checked_at",
    ])
      expect(migration).toContain(column);
    expect(migration).toContain(
      "grant select on public.public_player_seo_manifest to anon",
    );
  });

  it("keeps the snapshot bounded and independent from the rich views", () => {
    expect(migration).toContain("limit 5");
    expect(migration).not.toContain("public.public_player_search");
    expect(migration).not.toContain("public.public_result_groups");
    expect(migration).not.toMatch(/\bover\s*\(/iu);
  });

  it("applies the division invariants to the snapshot", () => {
    expect(migration).toContain("public.is_award_rank(r2.rank_text)");
    expect(migration).toContain("public.is_historical_division_record");
    expect(migration).toContain("t2.held_on <= current_date");
    expect(migration).toContain("spi.match_status <> 'disputed'");
    expect(migration).toContain("r.record_status <> 'disputed'");
    expect(migration).toContain("p.merged_into_player_id is null");
  });

  it("keeps hidden sources out of the public source names", () => {
    expect(migration).toContain("s.code not in ('mock', 'band')");
  });
});
