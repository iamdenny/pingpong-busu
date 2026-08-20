import { divisionSystemCodes, type DivisionSystem } from "@busu/domain";

export const MAX_MANIFEST_AWARDS = 5;
const MAX_TEXT_LENGTH = 200;
const MAX_SOURCE_NAMES = 20;

export type SeoAward = {
  rank: string;
  date: string | null;
  tournament: string | null;
  event: string | null;
  division: string | null;
  division_system: DivisionSystem | null;
};

export type SeoPlayer = {
  id: string;
  canonical_name: string;
  homonym_nickname: string | null;
  primary_region: string | null;
  primary_club: string | null;
  result_count: number;
  source_count: number;
  // The record snapshot lands only once the extended manifest view is
  // deployed, so every field below stays optional for older payloads.
  recent_observed_division?: string | null;
  recent_observed_division_system?: DivisionSystem | null;
  recent_awards?: readonly SeoAward[];
  source_names?: readonly string[];
  last_checked_at?: string | null;
};

const MANIFEST_IDENTITY_COLUMNS = [
  "id",
  "canonical_name",
  "homonym_nickname",
  "primary_region",
  "primary_club",
  "result_count",
  "source_count",
] as const;

const MANIFEST_RECORD_COLUMNS = [
  "recent_observed_division",
  "recent_observed_division_system",
  "recent_awards",
  "source_names",
  "last_checked_at",
] as const;

export const MANIFEST_IDENTITY_SELECT = MANIFEST_IDENTITY_COLUMNS.join(",");
export const MANIFEST_COLUMNS = [
  ...MANIFEST_IDENTITY_COLUMNS,
  ...MANIFEST_RECORD_COLUMNS,
].join(",");

// The production read gate builds this bundle against the database as it is
// *before* the release's migration runs, so a manifest without the record
// columns must degrade to the identity snapshot instead of failing the build.
// PostgREST answers an unknown column with 400 and SQLSTATE 42703.
export function isMissingRecordColumn(status: number, body: string): boolean {
  if (status !== 400) return false;
  if (body.includes("42703")) return true;
  return MANIFEST_RECORD_COLUMNS.some((column) => body.includes(column));
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

function boundedText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid ${label}.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_TEXT_LENGTH) throw new Error(`Invalid ${label}.`);
  return trimmed;
}

function divisionSystem(value: unknown, label: string): DivisionSystem | null {
  const text = boundedText(value, label);
  if (text === null) return null;
  if (!(divisionSystemCodes as readonly string[]).includes(text))
    throw new Error(`Invalid ${label}.`);
  return text as DivisionSystem;
}

// Dates arrive as PostgREST date strings; anything else would end up rendered
// verbatim in the static HTML, so an unexpected shape is dropped rather than
// trusted.
function awardDate(value: unknown, label: string): string | null {
  const text = boundedText(value, label);
  if (text === null) return null;
  if (!isoDatePattern.test(text)) throw new Error(`Invalid ${label}.`);
  return text;
}

function parseAwards(value: unknown, label: string): SeoAward[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  if (value.length > MAX_MANIFEST_AWARDS) throw new Error(`Invalid ${label}.`);
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null)
      throw new Error(`Invalid ${label} entry ${index}.`);
    const row = entry as Record<string, unknown>;
    const rank = boundedText(row.rank, `${label} rank ${index}`);
    if (rank === null) throw new Error(`Invalid ${label} rank ${index}.`);
    return {
      rank,
      date: awardDate(row.date, `${label} date ${index}`),
      tournament: boundedText(row.tournament, `${label} tournament ${index}`),
      event: boundedText(row.event, `${label} event ${index}`),
      division: boundedText(row.division, `${label} division ${index}`),
      division_system: divisionSystem(
        row.division_system,
        `${label} division system ${index}`,
      ),
    };
  });
}

function parseSourceNames(value: unknown, label: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  if (value.length > MAX_SOURCE_NAMES) throw new Error(`Invalid ${label}.`);
  return value
    .map((entry, index) => boundedText(entry, `${label} ${index}`))
    .filter((entry): entry is string => entry !== null);
}

function parseTimestamp(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 64)
    throw new Error(`Invalid ${label}.`);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid ${label}.`);
  return new Date(parsed).toISOString();
}

export function parseManifest(value: unknown): SeoPlayer[] {
  if (!Array.isArray(value))
    throw new Error("Public SEO manifest must be an array.");
  return value.map((row, index) => {
    if (typeof row !== "object" || row === null)
      throw new Error(`Invalid public SEO row ${index}.`);
    const candidate = row as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !uuidPattern.test(candidate.id))
      throw new Error(`Invalid id in public SEO row ${index}.`);
    if (
      typeof candidate.canonical_name !== "string" ||
      candidate.canonical_name.trim().length === 0 ||
      candidate.canonical_name.length > MAX_TEXT_LENGTH
    )
      throw new Error(`Invalid canonical_name in public SEO row ${index}.`);
    if (
      !Number.isInteger(candidate.result_count) ||
      Number(candidate.result_count) < 0 ||
      !Number.isInteger(candidate.source_count) ||
      Number(candidate.source_count) < 0
    )
      throw new Error(`Invalid counts in public SEO row ${index}.`);
    return {
      id: candidate.id,
      canonical_name: candidate.canonical_name.trim(),
      homonym_nickname: boundedText(
        candidate.homonym_nickname,
        `homonym_nickname in public SEO row ${index}`,
      ),
      primary_region: boundedText(
        candidate.primary_region,
        `primary_region in public SEO row ${index}`,
      ),
      primary_club: boundedText(
        candidate.primary_club,
        `primary_club in public SEO row ${index}`,
      ),
      result_count: Number(candidate.result_count),
      source_count: Number(candidate.source_count),
      recent_observed_division: boundedText(
        candidate.recent_observed_division,
        `recent_observed_division in public SEO row ${index}`,
      ),
      recent_observed_division_system: divisionSystem(
        candidate.recent_observed_division_system,
        `recent_observed_division_system in public SEO row ${index}`,
      ),
      recent_awards: parseAwards(
        candidate.recent_awards,
        `recent_awards in public SEO row ${index}`,
      ),
      source_names: parseSourceNames(
        candidate.source_names,
        `source_names in public SEO row ${index}`,
      ),
      last_checked_at: parseTimestamp(
        candidate.last_checked_at,
        `last_checked_at in public SEO row ${index}`,
      ),
    };
  });
}

export async function fetchPublicPlayerManifest(options: {
  supabaseUrl: string;
  publishableKey: string;
  fetch?: typeof fetch;
  pageSize?: number;
  requestTimeoutMs?: number;
  maxDurationMs?: number;
  maxPages?: number;
  maxPlayers?: number;
}): Promise<SeoPlayer[]> {
  const fetcher = options.fetch ?? fetch;
  const pageSize = options.pageSize ?? 500;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  // 2026-08-21 baseline: 13,148 players over 27 identity-column pages took
  // 16.5s. The record snapshot adds a per-player lateral subquery, so the
  // ceiling leaves room for a several-fold slowdown while still failing closed.
  const maxDurationMs = options.maxDurationMs ?? 300_000;
  const maxPages = options.maxPages ?? 50;
  const maxPlayers = options.maxPlayers ?? 25_000;
  if (pageSize < 1 || pageSize > 1_000)
    throw new Error("Public SEO manifest page size is out of bounds.");
  const rows: SeoPlayer[] = [];
  const startedAt = Date.now();
  let lastId: string | undefined;
  let select: string = MANIFEST_COLUMNS;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const remainingMs = maxDurationMs - (Date.now() - startedAt);
    if (remainingMs <= 0)
      throw new Error("Public SEO manifest exceeded its time budget.");
    const request = async (columns: string): Promise<Response> => {
      const endpoint = new URL(
        "/rest/v1/public_player_seo_manifest",
        options.supabaseUrl,
      );
      endpoint.searchParams.set("select", columns);
      endpoint.searchParams.set("source_count", "gt.0");
      endpoint.searchParams.set("order", "id.asc");
      endpoint.searchParams.set("limit", String(pageSize));
      if (lastId) endpoint.searchParams.set("id", `gt.${lastId}`);
      return fetcher(endpoint, {
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
        headers: {
          apikey: options.publishableKey,
          Authorization: `Bearer ${options.publishableKey}`,
        },
      });
    };
    let response = await request(select);
    if (!response.ok && select === MANIFEST_COLUMNS) {
      const body = await response.text().catch(() => "");
      if (!isMissingRecordColumn(response.status, body))
        throw new Error(
          `Public SEO manifest fetch failed (${response.status}).`,
        );
      select = MANIFEST_IDENTITY_SELECT;
      response = await request(select);
    }
    if (!response.ok)
      throw new Error(`Public SEO manifest fetch failed (${response.status}).`);
    const page = parseManifest(await response.json());
    if (page.some((row, index) => index > 0 && row.id <= page[index - 1]!.id))
      throw new Error("Public SEO manifest page is not ordered by player id.");
    if (lastId && page[0] && page[0].id <= lastId)
      throw new Error("Public SEO manifest pagination did not advance.");
    rows.push(...page.filter((row) => row.source_count > 0));
    if (rows.length > maxPlayers)
      throw new Error("Public SEO manifest exceeded its player budget.");
    if (page.length < pageSize) break;
    lastId = page.at(-1)?.id;
    if (pageNumber === maxPages - 1)
      throw new Error("Public SEO manifest exceeded its page budget.");
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}
