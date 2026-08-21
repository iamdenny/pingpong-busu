import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608210002_trending_player_views.sql",
  ),
  "utf8",
);

describe("trending player views migration", () => {
  it("keeps the view counters private and only exposes the bounded ranking", () => {
    for (const table of ["player_view_counts", "player_view_origins"]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(
        `revoke all on public.${table} from public, anon, authenticated`,
      );
      expect(migration).not.toContain(`grant select on public.${table} to anon`);
    }
    expect(migration).toContain(
      "grant select on public.public_trending_players to anon",
    );
    expect(migration).toContain("limit 10");
  });

  it("stores no request origin, user agent or search term", () => {
    expect(migration).toContain("origin_hash ~ '^[0-9a-f]{64}$'");
    for (const column of ["ip", "user_agent", "query", "referrer"])
      expect(migration).not.toContain(`${column} text`);
  });

  it("counts one origin once per player and hour", () => {
    expect(migration).toContain(
      "primary key (origin_hash, player_id, bucket_start)",
    );
    expect(migration).toContain("on conflict do nothing");
    expect(migration).toContain("if v_origin_players >= 60 then");
  });

  it("hides players below the unique session threshold", () => {
    expect(migration).toContain("having sum(v.unique_sessions) >= 5");
    expect(migration).toContain(
      "where v.bucket_start >= date_trunc('hour', now()) - interval '23 hours'",
    );
  });

  it("prunes both tables shortly after they leave the window", () => {
    expect(migration).toContain(
      "create or replace function public.prune_player_view_counts_internal()",
    );
    expect(migration.match(/interval '25 hours'/gu)).toHaveLength(2);
    expect(migration).toContain("'prune-player-view-counts'");
  });

  it("keeps the private functions on the service role", () => {
    for (const signature of [
      "public.record_player_view_internal(uuid, text)",
      "public.prune_player_view_counts_internal()",
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`,
      );
      expect(migration).toContain(
        `grant execute on function ${signature} to service_role`,
      );
    }
  });

  it("skips merged players in the ranking", () => {
    expect(migration).toContain("p.merged_into_player_id is null");
  });
});
