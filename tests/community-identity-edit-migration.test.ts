import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { homonymNicknameCatalog } from "@busu/domain";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130007_community_identity_edits.sql",
  ),
  "utf8",
);
const partitionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130008_homonym_nickname_partitions.sql",
  ),
  "utf8",
);
const submitEdgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/submit-identity-claim/index.ts"),
  "utf8",
);
const revertEdgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/revert-identity-edit/index.ts"),
  "utf8",
);

describe("community identity edit migration", () => {
  it("partitions unlimited candidates into curated nickname groups atomically", () => {
    expect(migration).toContain(
      "drop view if exists public.identity_claim_review_queue",
    );
    expect(migration).toContain("status = 'rejected'");
    expect(migration).toContain("identity_claims_candidate_count_positive");
    expect(migration).toContain("apply_identity_edit_internal");
    expect(migration).not.toContain(
      "array_length(p_source_player_public_ids, 1), 0) not between 1 and 10",
    );
    expect(migration).toContain("public.merge_players_internal(");
    expect(partitionMigration).toContain("apply_identity_partition_internal");
    expect(partitionMigration).toContain("homonym_nickname");
    expect(partitionMigration).toContain("'파워 드라이브'");
    expect(partitionMigration).toContain("'루프 드라이브 최강자'");
    expect(partitionMigration).toContain("identity_partition_members");
    expect(submitEdgeFunction).not.toMatch(
      /allCandidateIds\.length\s*>\s*\d+/u,
    );
    expect(submitEdgeFunction).toContain("apply_identity_partition_internal");
    expect(submitEdgeFunction).toContain("value.groups");
    for (const nickname of homonymNicknameCatalog) {
      expect(submitEdgeFunction).toContain(`"${nickname.code}"`);
      expect(partitionMigration).toContain(`'${nickname.code}'`);
    }
    expect(submitEdgeFunction).toContain("value.editorId");
    expect(submitEdgeFunction).toContain("busu/anonymous-editor/v1");
  });

  it("keeps mutations behind service role functions while exposing sanitized history", () => {
    expect(migration).toContain("revert_identity_edit_community_internal");
    expect(partitionMigration).toContain("revert_identity_partition_internal");
    expect(migration).toContain("list_identity_edit_history");
    expect(migration).toContain("list_identity_candidate_evidence");
    expect(migration).toContain(
      "grant execute on function public.list_identity_edit_history(text) to anon, authenticated",
    );
    expect(migration).toContain("to service_role");
    expect(partitionMigration).toContain("to service_role");
    expect(revertEdgeFunction).toContain(
      "revert_identity_edit_community_internal",
    );
    expect(revertEdgeFunction).toContain("value.editorId");
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete).*identity_/iu,
    );
    expect(partitionMigration).not.toMatch(
      /grant\s+(?:insert|update|delete).*identity_/iu,
    );
  });

  it("retains reversible source links instead of deleting players or results", () => {
    expect(migration).toContain("identity_merge_operation_players");
    expect(migration).toContain("identity_merge_operation_identities");
    expect(migration).toContain("revert_player_merge_internal");
    expect(partitionMigration).toContain("revert_player_merge_internal");
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(players|results)/iu,
    );
    expect(partitionMigration).not.toMatch(
      /delete\s+from\s+public\.(players|results)/iu,
    );
  });
});
