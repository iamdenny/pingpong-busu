import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608140001_player_search_priority.sql",
  ),
  "utf8",
);

describe("player search priority migration", () => {
  it("selects the latest non-empty observed region and club", () => {
    expect(migration).toContain("nullif(btrim(t.region), '')");
    expect(migration).toContain("nullif(btrim(r.club_text), '')");
    expect(migration).toContain(
      "order by coalesce(t.held_on, r.source_published_on) desc nulls last",
    );
    expect(migration).toContain("r.last_checked_at desc");
  });

  it("falls back through the latest source identity and reviewed player fields", () => {
    expect(migration).toContain("nullif(btrim(spi.source_region), '')");
    expect(migration).toContain("nullif(btrim(spi.source_club_text), '')");
    expect(migration).toContain(
      "order by spi.last_checked_at desc, spi.id desc",
    );
    expect(migration).toContain("p.primary_region\n  ) primary_region");
    expect(migration).toContain("c.canonical_name\n  ) primary_club");
  });

  it("keeps disputed records out of the public summary", () => {
    expect(migration).toContain("r.record_status <> 'disputed'");
  });

  it("publishes tournament names for award and participation cards", () => {
    expect(migration).toContain("'tournament', r.tournament_name_text");
    expect(migration).toContain("'last_checked_at', r.last_checked_at");
    expect(migration).toContain("latest_participation_tournament");
    expect(migration).toContain("latest_participation_checked_at");
    expect(migration).toContain("where not public.is_award_rank(r.rank_text)");
  });
});
