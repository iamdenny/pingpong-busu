import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130001_reversible_player_merges.sql",
  ),
  "utf8",
);

describe("reversible player merge migration", () => {
  it("captures player and source identity state before an admin merge", () => {
    expect(migration).toContain("identity_merge_operation_players");
    expect(migration).toContain("identity_merge_operation_identities");
    expect(migration).toContain("previous_player_id");
    expect(migration).toContain("previous_match_status");
    expect(migration).toContain("target_previous_identity_status");
  });

  it("restores captured links and rejects conflicting or out-of-order reverts", () => {
    expect(migration).toContain("revert_player_merge_internal");
    expect(migration).toContain("player_merge_has_later_operations");
    expect(migration).toContain("player_merge_revert_conflict");
    expect(migration).toContain("set player_id = item.previous_player_id");
    expect(migration).toContain("match_status = item.previous_match_status");
  });

  it("keeps merge operations service-role only and does not delete source data", () => {
    expect(migration).toContain(
      "grant execute on function public.merge_players_internal",
    );
    expect(migration).toContain(
      "grant execute on function public.revert_player_merge_internal",
    );
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(players|results)/iu,
    );
  });
});
