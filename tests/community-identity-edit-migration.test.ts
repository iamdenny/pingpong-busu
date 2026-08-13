import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
const customNicknameMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130009_single_group_custom_nicknames.sql",
  ),
  "utf8",
);
const hardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130011_harden_identity_aliases_and_orphans.sql",
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
  it("partitions unlimited candidates into user-entered nickname groups atomically", () => {
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
    expect(partitionMigration).toContain(
      "char_length(homonym_nickname) between 2 and 20",
    );
    expect(partitionMigration).not.toContain(
      "players_homonym_nickname_catalog_check",
    );
    expect(partitionMigration).not.toContain("'power-drive'");
    expect(partitionMigration).toContain("identity_partition_members");
    expect(partitionMigration).toContain(
      "claim_identity_community_request_internal",
    );
    expect(migration).toContain("claim_identity_global_request_internal");
    expect(migration).toContain(
      "'identity-fingerprint:' || p_candidate_fingerprint",
    );
    expect(partitionMigration).toContain("pg_advisory_xact_lock");
    expect(partitionMigration).toContain(
      "'identity-name:' || v_normalized_name",
    );
    expect(partitionMigration).toContain(
      "'identity-name:' || v_operation.normalized_name",
    );
    expect(customNicknameMigration).toContain(
      "drop constraint if exists players_homonym_nickname_catalog_check",
    );
    expect(customNicknameMigration).toContain(
      "jsonb_array_length(p_groups) < 1",
    );
    expect(customNicknameMigration).toContain("v_candidate_count < 1");
    expect(customNicknameMigration).toContain(
      "on public.players(normalized_name, lower(homonym_nickname))",
    );
    expect(customNicknameMigration).toContain(
      "pg_catalog.hashtextextended(p_fingerprint, 0)",
    );
    expect(customNicknameMigration).toContain(
      "'identity-name:' || v_normalized_name",
    );
    expect(customNicknameMigration).toContain(
      "perform public.claim_identity_global_request_internal()",
    );
    expect(customNicknameMigration).toContain("(19|20)[0-9]{2}");
    expect(customNicknameMigration).toContain("(로|길|동|읍|면|리)");
    expect(customNicknameMigration).toContain("01[016789][ -]?");
    expect(customNicknameMigration).toContain("+@[[:alnum:].-]+");
    expect(hardeningMigration).toContain(
      "pg_catalog.hashtextextended(p_fingerprint, 0)",
    );
    expect(hardeningMigration).toContain(
      "perform public.claim_identity_global_request_internal()",
    );
    expect(hardeningMigration).toContain(
      "create or replace view public.public_player_search",
    );
    expect(hardeningMigration).toContain("01[016789][ -]?");
    expect(hardeningMigration).toContain("+@[[:alnum:].-]+");
    expect(submitEdgeFunction).not.toMatch(
      /allCandidateIds\.length\s*>\s*\d+/u,
    );
    expect(submitEdgeFunction).toContain("apply_identity_partition_internal");
    expect(submitEdgeFunction).toContain("value.groups");
    expect(submitEdgeFunction).toContain("normalizeHomonymNickname");
    expect(submitEdgeFunction).toContain("isValidHomonymNickname");
    expect(submitEdgeFunction).toContain("sensitiveNicknamePatterns");
    expect(submitEdgeFunction).not.toContain("homonymNicknameCodes");
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
    expect(customNicknameMigration).toContain("to service_role");
    expect(revertEdgeFunction).toContain(
      "revert_identity_edit_community_internal",
    );
    expect(revertEdgeFunction).toContain("value.editorId");
    expect(revertEdgeFunction).toContain(
      "claim_identity_community_request_internal",
    );
    expect(migration).toContain(
      "cardinality(p_player_public_ids) between 1 and 100",
    );
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
