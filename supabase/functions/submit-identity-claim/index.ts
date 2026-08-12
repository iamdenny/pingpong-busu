import { createClient } from "npm:@supabase/supabase-js@2";
import { hasValidPublishableApiKey } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { isRecord } from "../_shared/normalize.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const privateCodePattern = /^\d{4}$/u;
const sensitiveNotePattern =
  /(?:01[016789][ -]?\d{3,4}[ -]?\d{4})|(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu;
const encoder = new TextEncoder();

interface ClaimInput {
  candidateIds: string[];
  privateCode: string;
  note?: string;
  website?: string;
}

function parseClaimInput(value: unknown): ClaimInput {
  if (!isRecord(value) || !Array.isArray(value.candidateIds))
    throw new Error("invalid_identity_claim");
  const candidateIds = value.candidateIds.filter(
    (candidate): candidate is string => typeof candidate === "string",
  );
  if (
    candidateIds.length !== value.candidateIds.length ||
    candidateIds.length < 1 ||
    candidateIds.length > 10
  )
    throw new Error("invalid_identity_claim");
  const uniqueCandidateIds = [
    ...new Set(candidateIds.map((candidate) => candidate.toLowerCase())),
  ];
  if (
    uniqueCandidateIds.length !== candidateIds.length ||
    uniqueCandidateIds.some((candidate) => !uuidPattern.test(candidate))
  )
    throw new Error("invalid_identity_claim");
  if (
    typeof value.privateCode !== "string" ||
    !privateCodePattern.test(value.privateCode)
  )
    throw new Error("invalid_identity_claim");
  const note = typeof value.note === "string" ? value.note.trim() : undefined;
  if (
    note !== undefined &&
    note.length > 0 &&
    (note.length < 10 || note.length > 500)
  )
    throw new Error("invalid_identity_claim");
  if (note && sensitiveNotePattern.test(note))
    throw new Error("sensitive_note_rejected");
  const website =
    typeof value.website === "string" ? value.website.trim() : undefined;
  return {
    candidateIds: uniqueCandidateIds,
    privateCode: value.privateCode,
    ...(note ? { note } : {}),
    ...(website ? { website } : {}),
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
    if (input.website)
      return json({
        accepted: true,
        referenceId: "RECEIVED",
        status: "pending",
      });
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey)
      return json({ error: "server_not_configured" }, 503);

    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: candidates, error: candidateError } = await client
      .from("players")
      .select("public_id,normalized_name")
      .in("public_id", input.candidateIds);
    if (candidateError) return json({ error: "candidate_lookup_failed" }, 500);
    if (!candidates || candidates.length !== input.candidateIds.length)
      return json({ error: "candidate_not_found" }, 400);
    const normalizedNames = [
      ...new Set(candidates.map((candidate) => candidate.normalized_name)),
    ];
    if (normalizedNames.length !== 1 || !normalizedNames[0])
      return json({ error: "candidate_name_mismatch" }, 400);

    const sortedCandidateIds = [...input.candidateIds].sort();
    const verificationHash = await hmacHex(
      serviceRoleKey,
      `busu/identity-claim/v1\u0000${normalizedNames[0]}\u0000${input.privateCode}`,
    );
    const candidateFingerprint = await digestHex(
      "SHA-256",
      sortedCandidateIds.join("\u0000"),
    );
    const { data, error } = await client.rpc("submit_identity_claim_internal", {
      p_player_public_ids: sortedCandidateIds,
      p_verification_hash: verificationHash,
      p_candidate_fingerprint: candidateFingerprint,
      p_note: input.note ?? null,
    });
    if (error) {
      if (error.message.includes("identity_claim_rate_limited"))
        return json({ error: "rate_limited" }, 429);
      if (error.message.includes("identity_claim_candidates_mismatch"))
        return json({ error: "candidate_name_mismatch" }, 400);
      return json({ error: "claim_insert_failed" }, 500);
    }
    if (typeof data !== "string" || !uuidPattern.test(data))
      return json({ error: "invalid_claim_response" }, 500);
    return json(
      {
        accepted: true,
        referenceId: data.slice(0, 8).toUpperCase(),
        status: "pending",
      },
      202,
    );
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
});
