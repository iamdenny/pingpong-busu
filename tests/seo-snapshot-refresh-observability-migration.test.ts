import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608210003_seo_snapshot_refresh_observability.sql",
  ),
  "utf8",
);

describe("SEO snapshot refresh observability migration", () => {
  // effective_division_system is plpgsql; evaluating it once per result instead
  // of once per aggregate is what makes the refresh affordable.
  it("evaluates the division system once and drops the correlated subquery", () => {
    expect(migration).toContain(
      "create temporary table seo_scoped on commit drop",
    );
    expect(migration).toContain("row_number() over (");
    expect(migration.match(/effective_division_system\(/gu)).toHaveLength(1);
    expect(migration).not.toContain("spi2.player_id = p.id");
  });

  it("records every run, including one that could not finish", () => {
    expect(migration).toContain(
      "create table if not exists public.player_seo_snapshot_runs",
    );
    expect(migration).toContain("exception when others then");
    expect(migration).toContain("failed_reason");
    expect(migration).toContain(
      "grant select on public.player_seo_snapshot_runs to anon",
    );
    expect(migration).toContain(
      "alter table public.player_seo_snapshot_runs enable row level security",
    );
  });

  it("keeps the refresh service role only and bounded in time", () => {
    expect(migration).toContain("set local statement_timeout");
    expect(migration).toContain(
      "grant execute on function public.refresh_player_seo_record_snapshot() to service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.refresh_player_seo_record_snapshot() from public, anon, authenticated",
    );
  });

  it("still applies the anon predicates and the division invariants", () => {
    expect(migration).toContain("spi.match_status <> 'disputed'");
    expect(migration).toContain("r.record_status <> 'disputed'");
    expect(migration).toContain("p.merged_into_player_id is null");
    expect(migration).toContain("public.is_historical_division_record");
    expect(migration).toContain("public.is_award_rank(rank_text)");
    expect(migration).toContain("position <= 5");
    expect(migration).toContain("not in ('mock','band')");
  });
});
