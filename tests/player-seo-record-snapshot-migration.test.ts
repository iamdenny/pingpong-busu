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
  // An unpopulated materialized view cannot be queried, which would break the
  // public view until the first refresh; an empty table answers immediately.
  it("creates an empty table the public view can read from day one", () => {
    expect(migration).toContain(
      "create table if not exists public.player_seo_record_snapshot",
    );
    expect(migration).not.toContain("create materialized view public.player");
    expect(migration).toContain("left join public.player_seo_record_snapshot");
    expect(migration).toContain("limit 5");
  });

  // The deployment must never wait on the computation: 202608210001 first tried
  // to populate during `supabase db push` and hit the migration connection's own
  // statement timeout.
  it("keeps the computation out of the migration", () => {
    const beforeFunction = migration.slice(
      0,
      migration.indexOf("create or replace function"),
    );
    expect(beforeFunction).not.toContain("cross join lateral");
    expect(migration).toContain("set local statement_timeout");
    expect(migration).toContain(
      "create temporary table player_seo_record_staging on commit drop",
    );
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
    expect(migration).toContain("id text primary key");
  });

  it("applies the division invariants to the snapshot", () => {
    expect(migration).toContain("public.is_award_rank(r2.rank_text)");
    expect(migration).toContain("public.is_historical_division_record");
    expect(migration).toContain("t2.held_on <= current_date");
    expect(migration).toContain("s.code not in ('mock', 'band')");
  });

  it("grants anon the snapshot the security_invoker view reads", () => {
    expect(migration).toContain(
      "alter table public.player_seo_record_snapshot enable row level security",
    );
    expect(migration).toContain(
      "grant select on public.player_seo_record_snapshot to anon",
    );
    expect(migration).toContain(
      "grant select on public.public_player_seo_manifest to anon",
    );
    expect(migration).toContain("with (security_invoker = true)");
  });

  it("keeps the snapshot fresh without blocking readers", () => {
    expect(migration).toContain("refresh-player-seo-record-snapshot");
    expect(migration).toContain(
      "grant execute on function public.refresh_player_seo_record_snapshot() to service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.refresh_player_seo_record_snapshot() from public, anon, authenticated",
    );
  });
});
