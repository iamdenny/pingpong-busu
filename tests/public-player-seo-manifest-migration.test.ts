import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608150008_public_player_seo_manifest.sql",
  ),
  "utf8",
);

describe("public player SEO manifest migration", () => {
  it("uses bounded raw joins without depending on rich public views", () => {
    expect(migration).toContain(
      "create or replace view public.public_player_seo_manifest",
    );
    expect(migration).toContain("join public.results r");
    expect(migration).not.toContain("public.public_player_search");
    expect(migration).not.toContain("public.public_result_groups");
    expect(migration).not.toMatch(/\bover\s*\(/iu);
  });

  it("excludes disputed and merged records and exposes public metadata", () => {
    expect(migration).toContain("spi.match_status <> 'disputed'");
    expect(migration).toContain("r.record_status <> 'disputed'");
    expect(migration).toContain("p.merged_into_player_id is null");
    expect(migration).toContain(
      "grant select on public.public_player_seo_manifest to anon",
    );
  });
});
