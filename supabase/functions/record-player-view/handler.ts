import {
  hasValidPublishableApiKey,
  type FunctionAuthEnvironment,
} from "../_shared/auth.ts";

export interface RecordPlayerViewEnvironment extends FunctionAuthEnvironment {
  playerViewAllowedOrigins?: string;
  originSecret?: string;
}

export type RecordPlayerViewRpc = (
  name: "record_player_view_internal",
  parameters: Record<string, unknown>,
) => Promise<{ error?: { message: string } | null }>;

interface Dependencies {
  environment: RecordPlayerViewEnvironment;
  rpc: RecordPlayerViewRpc;
  hashOrigin: (request: Request, secret: string) => Promise<string>;
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maxBodyBytes = 256;

function json(value: unknown, status = 202) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function origins(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => {
        try {
          return new URL(item).origin === item;
        } catch {
          return false;
        }
      }),
  );
}

function parse(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "playerId")) return undefined;
  const { playerId } = record;
  if (typeof playerId !== "string" || !uuid.test(playerId)) return undefined;
  return playerId;
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes)
    throw new Error("body_too_large");
  const body = await request.text();
  if (body.length > maxBodyBytes) throw new Error("body_too_large");
  return JSON.parse(body);
}

export function createRecordPlayerViewHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok");
    if (request.method !== "POST")
      return json({ code: "method_not_allowed" }, 405);
    if (!hasValidPublishableApiKey(request, dependencies.environment))
      return json({ code: "unauthorized" }, 401);
    const origin = request.headers.get("origin");
    if (
      !origin ||
      !origins(dependencies.environment.playerViewAllowedOrigins).has(origin)
    )
      return json({ code: "invalid_origin" }, 403);
    const secret = dependencies.environment.originSecret;
    if (!secret) return json({ code: "server_not_configured" }, 503);

    let playerId: string | undefined;
    try {
      playerId = parse(await readJson(request));
    } catch {
      playerId = undefined;
    }
    if (!playerId) return json({ code: "invalid_request" }, 400);

    // Only the HMAC of the request origin leaves this handler.
    const originHash = await dependencies.hashOrigin(request, secret);
    const { error } = await dependencies.rpc("record_player_view_internal", {
      p_public_id: playerId,
      p_origin_hash: originHash,
    });
    if (error) return json({ code: "not_recorded" }, 202);
    return json({ code: "recorded" }, 202);
  };
}
