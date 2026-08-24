import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608240001_player_view_record_outcome.sql",
  ),
  "utf8",
);

describe("player view record outcome migration", () => {
  it("replaces the void recorder so the return type can change", () => {
    expect(migration).toContain(
      "drop function if exists public.record_player_view_internal(uuid, text)",
    );
    expect(migration).toContain(") returns text");
  });

  it("names every branch the recorder can take", () => {
    for (const outcome of [
      "'invalid_input'",
      "'unknown_player'",
      "'origin_budget'",
      "'duplicate_origin'",
      "'counted'",
    ])
      expect(migration).toContain(`return ${outcome};`);
  });

  it("keeps the recorder on the service role", () => {
    expect(migration).toContain(
      "revoke all on function public.record_player_view_internal(uuid, text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.record_player_view_internal(uuid, text) to service_role",
    );
  });

  it("keeps the counting rules it reports on", () => {
    expect(migration).toContain("and merged_into_player_id is null");
    expect(migration).toContain("if v_origin_players >= 60 then");
    expect(migration).toContain("on conflict do nothing");
  });
});
