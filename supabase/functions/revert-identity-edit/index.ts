import { createClient } from "npm:@supabase/supabase-js@2";
import { hasValidPublishableApiKey } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { isRecord } from "../_shared/normalize.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const legacyPrivateCodePattern = /^\d{4}$/u;
const sensitiveReasonPattern =
  /(?:01[016789][ -]?\d{3,4}[ -]?\d{4})|(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu;
const encoder = new TextEncoder();

interface RevertInput {
  operationId: string;
  editorId?: string;
  legacyPrivateCode?: string;
  reason: string;
  website?: string;
}

function parseRevertInput(value: unknown): RevertInput {
  if (!isRecord(value)) throw new Error("invalid_identity_edit_revert");
  const operationId =
    typeof value.operationId === "string" ? value.operationId : "";
  const editorIdCandidate =
    typeof value.editorId === "string" ? value.editorId.toLowerCase() : undefined;
  const editorId =
    editorIdCandidate && uuidPattern.test(editorIdCandidate)
      ? editorIdCandidate
      : undefined;
  const legacyPrivateCode =
    typeof value.privateCode === "string" ? value.privateCode : undefined;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  const website =
    typeof value.website === "string" ? value.website.trim() : undefined;
  if (
    !uuidPattern.test(operationId) ||
    (!editorId &&
      (!legacyPrivateCode || !legacyPrivateCodePattern.test(legacyPrivateCode))) ||
    reason.length < 10 ||
    reason.length > 500 ||
    sensitiveReasonPattern.test(reason)
  )
    throw new Error("invalid_identity_edit_revert");
  return {
    operationId: operationId.toLowerCase(),
    ...(editorId ? { editorId } : {}),
    ...(!editorId && legacyPrivateCode ? { legacyPrivateCode } : {}),
    reason,
    ...(website ? { website } : {}),
  };
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
    const input = parseRevertInput(await request.json());
    if (input.website)
      return json({
        reverted: true,
        operationId: input.operationId,
        status: "reverted",
      });
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey)
      return json({ error: "server_not_configured" }, 503);

    const editorToken = input.editorId
      ? `busu/anonymous-editor/v1\u0000${input.editorId}`
      : `busu/identity-edit-revert/v1\u0000${input.operationId}\u0000${input.legacyPrivateCode}`;
    const actorHash = await hmacHex(serviceRoleKey, editorToken);
    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await client.rpc(
      "revert_identity_edit_community_internal",
      {
        p_operation_id: input.operationId,
        p_actor_hash: actorHash,
        p_reason: input.reason,
      },
    );
    if (error) {
      if (error.message.includes("identity_edit_revert_not_allowed"))
        return json({ error: "revert_not_allowed" }, 403);
      if (
        error.message.includes("player_merge_not_revertible") ||
        error.message.includes("player_merge_has_later_operations") ||
        error.message.includes("player_merge_revert_conflict")
      )
        return json({ error: "revert_conflict" }, 409);
      return json({ error: "identity_edit_revert_failed" }, 500);
    }
    if (typeof data !== "string" || !uuidPattern.test(data))
      return json({ error: "invalid_identity_edit_revert_response" }, 500);
    return json({
      reverted: true,
      operationId: data,
      status: "reverted",
    });
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
});
