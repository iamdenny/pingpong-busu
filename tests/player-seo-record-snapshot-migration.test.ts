import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608210001_player_seo_record_snapshot.sql",
  ),
  "utf8",
);

describe("player SEO record snapshot migration", () => {
  it("precomputes the snapshot instead of widening the enumerated view", () => {
    expect(migration).toContain(
      "create materialized view public.player_seo_record_snapshot",
    );
    expect(migration).toContain("left join public.player_seo_record_snapshot");
    expect(migration).toContain("limit 5");
  });

  // The snapshot is not RLS-protected, so losing either predicate would expose
  // rows anon cannot read through the base tables.
  it("reproduces the anon row-level predicates", () => {
    expect(migration).toContain("spi.match_status <> 'disputed'");
    expect(migration).toContain("r.record_status <> 'disputed'");
    expect(migration).toContain("spi2.match_status <> 'disputed'");
    expect(migration).toContain("r2.record_status <> 'disputed'");
    expect(migration).toContain("p.merged_into_player_id is null");
  });

  it("keys the snapshot by the public id and never the internal one", () => {
    expect(migration).toContain("p.public_id::text id");
    expect(migration).toContain("snapshot.id = base.id");
    expect(migration).not.toContain("p.id player_id");
  });

  it("applies the division invariants to the snapshot", () => {
    expect(migration).toContain("public.is_award_rank(r2.rank_text)");
    expect(migration).toContain("public.is_historical_division_record");
    expect(migration).toContain("t2.held_on <= current_date");
    expect(migration).toContain("s.code not in ('mock', 'band')");
  });

  it("grants anon the snapshot the security_invoker view reads", () => {
    expect(migration).toContain(
      "grant select on public.player_seo_record_snapshot to anon",
    );
    expect(migration).toContain(
      "grant select on public.public_player_seo_manifest to anon",
    );
    expect(migration).toContain("with (security_invoker = true)");
  });

  it("keeps the snapshot fresh without blocking readers", () => {
    expect(migration).toContain(
      "refresh materialized view concurrently public.player_seo_record_snapshot",
    );
    expect(migration).toContain("create unique index");
    expect(migration).toContain("refresh-player-seo-record-snapshot");
    expect(migration).toContain(
      "grant execute on function public.refresh_player_seo_record_snapshot() to service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.refresh_player_seo_record_snapshot() from public, anon, authenticated",
    );
  });
});
