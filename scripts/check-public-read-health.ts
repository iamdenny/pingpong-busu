import { pathToFileURL } from "node:url";
import { normalizePlayerName } from "@busu/domain";

type HealthTarget = {
  name: "seo-manifest" | "player-search" | "player-detail";
  endpoint: URL;
};

export type PublicReadHealthResult = {
  name: HealthTarget["name"];
  durationMs: number;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function requestRows(options: {
  target: HealthTarget;
  publishableKey: string;
  fetcher: typeof fetch;
  timeoutMs: number;
  maxDurationMs: number;
}): Promise<{ rows: unknown[]; result: PublicReadHealthResult }> {
  const startedAt = performance.now();
  const response = await options.fetcher(options.target.endpoint, {
    signal: AbortSignal.timeout(options.timeoutMs),
    headers: {
      apikey: options.publishableKey,
      Authorization: `Bearer ${options.publishableKey}`,
    },
  });
  const durationMs = Math.round(performance.now() - startedAt);
  if (!response.ok)
    throw new Error(
      `${options.target.name} health check failed (${response.status}).`,
    );
  if (durationMs > options.maxDurationMs)
    throw new Error(
      `${options.target.name} exceeded ${options.maxDurationMs}ms (${durationMs}ms).`,
    );
  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length === 0)
    throw new Error(`${options.target.name} returned no public rows.`);
  return {
    rows: payload,
    result: { name: options.target.name, durationMs },
  };
}

export async function checkPublicReadHealth(options: {
  supabaseUrl: string;
  publishableKey: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxDurationMs?: number;
}): Promise<PublicReadHealthResult[]> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxDurationMs = options.maxDurationMs ?? 2_500;
  const manifestEndpoint = new URL(
    "/rest/v1/public_player_seo_manifest",
    options.supabaseUrl,
  );
  // The static player documents render these columns, so a manifest missing
  // them must fail this gate rather than the later Pages build.
  manifestEndpoint.searchParams.set(
    "select",
    "id,canonical_name,recent_observed_division,recent_awards,source_names,last_checked_at",
  );
  manifestEndpoint.searchParams.set("order", "id.asc");
  manifestEndpoint.searchParams.set("limit", "1");
  const manifest = await requestRows({
    target: { name: "seo-manifest", endpoint: manifestEndpoint },
    publishableKey: options.publishableKey,
    fetcher,
    timeoutMs,
    maxDurationMs,
  });
  const first = manifest.rows[0];
  if (typeof first !== "object" || first === null)
    throw new Error("seo-manifest returned an invalid public row.");
  const id = "id" in first ? first.id : undefined;
  const canonicalName =
    "canonical_name" in first ? first.canonical_name : undefined;
  if (
    typeof id !== "string" ||
    !uuidPattern.test(id) ||
    typeof canonicalName !== "string" ||
    canonicalName.trim().length === 0
  )
    throw new Error("seo-manifest returned an invalid player identity.");
  for (const column of [
    "recent_observed_division",
    "recent_awards",
    "source_names",
    "last_checked_at",
  ])
    if (!(column in first))
      throw new Error(`seo-manifest is missing the ${column} column.`);
  if (!Array.isArray(first.recent_awards))
    throw new Error("seo-manifest returned an invalid record snapshot.");

  const searchEndpoint = new URL(
    "/rest/v1/public_player_search",
    options.supabaseUrl,
  );
  searchEndpoint.searchParams.set("select", "id");
  searchEndpoint.searchParams.set(
    "normalized_name",
    `eq.${normalizePlayerName(canonicalName)}`,
  );
  searchEndpoint.searchParams.set("limit", "1");
  const detailEndpoint = new URL(
    "/rest/v1/public_results",
    options.supabaseUrl,
  );
  detailEndpoint.searchParams.set("select", "id");
  detailEndpoint.searchParams.set("player_public_id", `eq.${id}`);
  detailEndpoint.searchParams.set("limit", "1");
  const search = await requestRows({
    target: { name: "player-search", endpoint: searchEndpoint },
    publishableKey: options.publishableKey,
    fetcher,
    timeoutMs,
    maxDurationMs,
  });
  const detail = await requestRows({
    target: { name: "player-detail", endpoint: detailEndpoint },
    publishableKey: options.publishableKey,
    fetcher,
    timeoutMs,
    maxDurationMs,
  });
  return [manifest.result, search.result, detail.result];
}

export async function checkPublicReadHealthFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PublicReadHealthResult[]> {
  const supabaseUrl = environment.PUBLIC_READ_SUPABASE_URL;
  const publishableKey = environment.PUBLIC_READ_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey)
    throw new Error("Production public read health configuration is required.");
  return checkPublicReadHealth({
    supabaseUrl,
    publishableKey,
    maxDurationMs: Number(environment.PUBLIC_READ_MAX_MS ?? "2500"),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const results = await checkPublicReadHealthFromEnvironment();
  for (const result of results)
    console.log(`${result.name}: ok (${result.durationMs}ms)`);
}
