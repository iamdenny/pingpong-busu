import { createClient } from "npm:@supabase/supabase-js@2";
import { hasValidPublishableApiKey } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { isRecord } from "../_shared/normalize.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const legacyPrivateCodePattern = /^\d{4}$/u;
const sensitiveNotePattern =
  /(?:01[016789][ -]?\d{3,4}[ -]?\d{4})|(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu;
const identityReasonCodes = new Set([
  "public-record-comparison",
  "club-and-region-comparison",
  "event-history-comparison",
]);
const homonymNicknameMinLength = 2;
const homonymNicknameMaxLength = 20;
const homonymNicknameCharactersPattern = /^[\p{L}\p{N} ._·-]+$/u;
const homonymNicknameLetterPattern = /\p{L}/u;
const encoder = new TextEncoder();

interface PartitionGroupInput {
  nickname: string;
  candidateIds: string[];
}

interface CommonClaimInput {
  editorId?: string;
  legacyPrivateCode?: string;
  note?: string;
  website?: string;
}

interface PartitionClaimInput extends CommonClaimInput {
  mode: "partition";
  groups: PartitionGroupInput[];
}

interface LegacyClaimInput extends CommonClaimInput {
  mode: "legacy";
  candidateIds: string[];
}

type ClaimInput = PartitionClaimInput | LegacyClaimInput;

function normalizeHomonymNickname(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function isValidHomonymNickname(value: string): boolean {
  return (
    value.length >= homonymNicknameMinLength &&
    value.length <= homonymNicknameMaxLength &&
    homonymNicknameCharactersPattern.test(value) &&
    homonymNicknameLetterPattern.test(value) &&
    !sensitiveNotePattern.test(value)
  );
}

function parseCandidateIds(value: unknown, allowSingle: boolean): string[] {
  if (!Array.isArray(value)) throw new Error("invalid_identity_claim");
  const candidateIds = value.filter(
    (candidate): candidate is string => typeof candidate === "string",
  );
  if (
    candidateIds.length !== value.length ||
    candidateIds.length < (allowSingle ? 1 : 2)
  )
    throw new Error("invalid_identity_claim");
  const normalized = candidateIds.map((candidate) => candidate.toLowerCase());
  if (
    new Set(normalized).size !== normalized.length ||
    normalized.some((candidate) => !uuidPattern.test(candidate))
  )
    throw new Error("invalid_identity_claim");
  return normalized;
}

function parseCommonInput(
  value: Record<string, unknown>,
  requireEditorId: boolean,
): CommonClaimInput {
  const editorIdCandidate =
    typeof value.editorId === "string"
      ? value.editorId.toLowerCase()
      : undefined;
  const editorId =
    editorIdCandidate && uuidPattern.test(editorIdCandidate)
      ? editorIdCandidate
      : undefined;
  const legacyPrivateCode =
    typeof value.privateCode === "string" ? value.privateCode : undefined;
  if (
    !editorId &&
    (requireEditorId ||
      !legacyPrivateCode ||
      !legacyPrivateCodePattern.test(legacyPrivateCode))
  )
    throw new Error("invalid_identity_claim");
  const note = typeof value.note === "string" ? value.note.trim() : undefined;
  if (
    note !== undefined &&
    note.length > 0 &&
    (note.length < 10 || note.length > 500)
  )
    throw new Error("invalid_identity_claim");
  if (
    note &&
    (!identityReasonCodes.has(note) || sensitiveNotePattern.test(note))
  )
    throw new Error("sensitive_note_rejected");
  const website =
    typeof value.website === "string" ? value.website.trim() : undefined;
  return {
    ...(editorId ? { editorId } : {}),
    ...(!editorId && legacyPrivateCode ? { legacyPrivateCode } : {}),
    ...(note ? { note } : {}),
    ...(website ? { website } : {}),
  };
}

function parseClaimInput(value: unknown): ClaimInput {
  if (!isRecord(value)) throw new Error("invalid_identity_claim");
  if (Array.isArray(value.groups)) {
    if (value.groups.length < 1) throw new Error("invalid_identity_claim");
    const groups = value.groups.map((candidateGroup) => {
      const nickname =
        isRecord(candidateGroup) && typeof candidateGroup.nickname === "string"
          ? normalizeHomonymNickname(candidateGroup.nickname)
          : "";
      if (!isRecord(candidateGroup) || !isValidHomonymNickname(nickname))
        throw new Error("invalid_identity_claim");
      return {
        nickname,
        candidateIds: parseCandidateIds(candidateGroup.candidateIds, true),
      };
    });
    const nicknames = groups.map((group) => group.nickname);
    const allCandidateIds = groups.flatMap((group) => group.candidateIds);
    if (
      new Set(nicknames).size !== nicknames.length ||
      allCandidateIds.length < 1 ||
      new Set(allCandidateIds).size !== allCandidateIds.length
    )
      throw new Error("invalid_identity_claim");
    return {
      mode: "partition",
      groups,
      ...parseCommonInput(value, true),
    };
  }
  return {
    mode: "legacy",
    candidateIds: parseCandidateIds(value.candidateIds, false),
    ...parseCommonInput(value, false),
  };
}

async function digestHex(algorithm: "SHA-256", value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(algorithm, encoder.encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(keyValue: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keyValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
  return [...signature]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  if (
    !hasValidPublishableApiKey(request, {
      publishableKeys: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
      publishableKey: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
      legacyAnonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    })
  )
    return json({ error: "unauthorized" }, 401);

  try {
    const input = parseClaimInput(await request.json());
    const groupCount = input.mode === "partition" ? input.groups.length : 1;
    if (input.website)
      return json({
        accepted: true,
        referenceId: "COMMUNITY",
        operationId: "00000000-0000-4000-8000-000000000000",
        status: "applied",
        groupCount,
      });
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey)
      return json({ error: "server_not_configured" }, 503);

    const editorToken = input.editorId
      ? `busu/anonymous-editor/v1\u0000${input.editorId}`
      : `busu/legacy-private-code/v1\u0000${input.legacyPrivateCode}`;
    const verificationHash = await hmacHex(serviceRoleKey, editorToken);
    const requestOrigin =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("cf-connecting-ip")?.trim() ||
      "unknown";
    const requestOriginHash = await hmacHex(
      serviceRoleKey,
      `busu/community-request-origin/v1\u0000${requestOrigin}`,
    );
    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: budgetError } = await client.rpc(
      "claim_identity_community_request_internal",
      {
        p_editor_hash: verificationHash,
        p_origin_hash: requestOriginHash,
      },
    );
    if (budgetError) {
      if (budgetError.message.includes("identity_community_rate_limited"))
        return json({ error: "rate_limited" }, 429);
      return json({ error: "identity_edit_failed" }, 500);
    }

    if (input.mode === "partition") {
      const sortedGroups = input.groups
        .map((group) => ({
          nickname: group.nickname,
          player_public_ids: [...group.candidateIds].sort(),
        }))
        .sort((left, right) => left.nickname.localeCompare(right.nickname));
      const candidateFingerprint = await digestHex(
        "SHA-256",
        JSON.stringify(sortedGroups),
      );
      const { data, error } = await client.rpc(
        "apply_identity_partition_internal",
        {
          p_groups: sortedGroups,
          p_editor_hash: verificationHash,
          p_fingerprint: candidateFingerprint,
          p_reason: input.note ?? null,
        },
      );
      if (error) {
        if (
          error.message.includes("identity_partition_rate_limited") ||
          error.message.includes("identity_community_rate_limited")
        )
          return json({ error: "rate_limited" }, 429);
        if (error.message.includes("identity_partition_candidates_mismatch"))
          return json({ error: "candidate_name_mismatch" }, 400);
        if (
          error.message.includes("identity_partition_stale") ||
          error.message.includes("player_merge_target_unavailable") ||
          error.message.includes("player_merge_candidates_mismatch")
        )
          return json({ error: "stale_candidates" }, 409);
        return json({ error: "identity_edit_failed" }, 500);
      }
      if (
        !isRecord(data) ||
        typeof data.partition_id !== "string" ||
        !uuidPattern.test(data.partition_id) ||
        typeof data.group_count !== "number" ||
        data.group_count < 1
      )
        return json({ error: "invalid_identity_edit_response" }, 500);
      return json({
        accepted: true,
        referenceId: data.partition_id.slice(0, 8).toUpperCase(),
        operationId: data.partition_id,
        status: "applied",
        groupCount: data.group_count,
      });
    }

    const sortedCandidateIds = [...input.candidateIds].sort();
    const candidateFingerprint = await digestHex(
      "SHA-256",
      sortedCandidateIds.join("\u0000"),
    );
    const { data, error } = await client.rpc("apply_identity_edit_internal", {
      p_player_public_ids: sortedCandidateIds,
      p_verification_hash: verificationHash,
      p_candidate_fingerprint: candidateFingerprint,
      p_reason: input.note ?? null,
    });
    if (error) {
      if (
        error.message.includes("identity_edit_rate_limited") ||
        error.message.includes("identity_community_rate_limited")
      )
        return json({ error: "rate_limited" }, 429);
      if (
        error.message.includes("identity_edit_candidates_mismatch") ||
        error.message.includes("player_merge_candidates_mismatch")
      )
        return json({ error: "candidate_name_mismatch" }, 400);
      if (
        error.message.includes("player_merge_target_unavailable") ||
        error.message.includes("player_merge_claim_mismatch")
      )
        return json({ error: "stale_candidates" }, 409);
      return json({ error: "identity_edit_failed" }, 500);
    }
    if (
      !isRecord(data) ||
      typeof data.claim_id !== "string" ||
      !uuidPattern.test(data.claim_id) ||
      typeof data.operation_id !== "string" ||
      !uuidPattern.test(data.operation_id)
    )
      return json({ error: "invalid_identity_edit_response" }, 500);
    return json({
      accepted: true,
      referenceId: data.claim_id.slice(0, 8).toUpperCase(),
      operationId: data.operation_id,
      status: "applied",
      groupCount: 1,
    });
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
});
