import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608150006_result_group_query_indexes.sql",
  ),
  "utf8",
);

describe("result group query indexes migration", () => {
  it("indexes the player and result joins used by grouped public views", () => {
    expect(migration).toContain("source_identity_player_status_source_idx");
    expect(migration).toContain("player_id, match_status, source_id");
    expect(migration).toContain("results_status_identity_source_idx");
    expect(migration).toContain(
      "record_status, source_player_identity_id, source_id",
    );
  });
});
