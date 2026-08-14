import {
  hasValidPublishableApiKey,
  type FunctionAuthEnvironment,
} from "../_shared/auth.ts";
import {
  reportOperationalIncident,
  type OperationalIncidentDependencies,
} from "../_shared/operational-incidents.ts";

export interface RuntimeIncidentEnvironment extends FunctionAuthEnvironment {
  runtimeIncidentAllowedOrigins?: string;
}
interface Dependencies extends OperationalIncidentDependencies {
  environment: RuntimeIncidentEnvironment;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const categories = new Set([
  "render_error",
  "uncaught_error",
  "unhandled_rejection",
]);
const routes = new Set(["/", "/search", "/players/:id", "/unknown"]);
const keys = new Set(["eventId", "category", "appVersion", "route"]);
const maxBodyBytes = 1024;
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
function parse(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.has(key))) return undefined;
  const { eventId, category, appVersion, route } = record;
  if (
    typeof eventId !== "string" ||
    !uuid.test(eventId) ||
    typeof category !== "string" ||
    !categories.has(category) ||
    typeof appVersion !== "string" ||
    !/^[0-9A-Za-z._-]{1,32}$/u.test(appVersion) ||
    typeof route !== "string" ||
    !routes.has(route)
  )
    return undefined;
  return {
    eventId,
    category: category as
      "render_error" | "uncaught_error" | "unhandled_rejection",
    appVersion,
    route,
  };
}
async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes)
    throw new Error("body_too_large");
  if (!request.body) throw new Error("empty_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBodyBytes) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createReportRuntimeIncidentHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok");
    if (request.method !== "POST")
      return json({ code: "method_not_allowed" }, 405);
    if (!hasValidPublishableApiKey(request, dependencies.environment))
      return json({ code: "unauthorized" }, 401);
    const origin = request.headers.get("origin");
    if (
      !origin ||
      !origins(dependencies.environment.runtimeIncidentAllowedOrigins).has(
        origin,
      )
    )
      return json({ code: "invalid_origin" }, 403);
    let input;
    try {
      input = parse(await readJson(request));
    } catch {
      input = undefined;
    }
    if (!input) return json({ code: "invalid_request" }, 400);
    const result = await reportOperationalIncident(input, dependencies);
    return json(result, result.status === "rate_limited" ? 429 : 202);
  };
}
