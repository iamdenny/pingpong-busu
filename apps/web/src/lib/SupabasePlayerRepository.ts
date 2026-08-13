import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  divisionSystemSchema,
  isAwardRank,
  normalizePlayerName,
  sortPlayerRecordsByLatest,
  sourceCodeSchema,
  type PlayerDetail,
  type PlayerRecord,
  type PlayerSummary,
  type SourceComparison,
} from "@busu/domain";
import type {
  IdentityCandidateEvidence,
  IdentityClaimInput,
  PlayerRepository,
  PlayerSearchInput,
  RefreshRequest,
} from "./repository";

const divisionObservationSchema = z.object({
  system: divisionSystemSchema,
  division: z.string().min(1),
  award_count: z.number().int().nonnegative(),
  participation_count: z.number().int().nonnegative(),
});

const summarySchema = z.object({
  id: z.coerce.string(),
  canonical_name: z.string(),
  normalized_name: z.string(),
  primary_region: z.string().nullable(),
  primary_club: z.string().nullable(),
  recent_observed_division: z.string().nullable(),
  recent_observed_division_system: divisionSystemSchema.nullish(),
  result_count: z.number(),
  award_results: z
    .array(z.object({ rank: z.string(), date: z.string().nullable() }))
    .nullish(),
  division_observations: z.array(divisionObservationSchema).max(100).nullish(),
  source_count: z.number(),
  last_checked_at: z.string(),
  identity_status: z.enum(["unreviewed", "likely", "verified", "disputed"]),
});
const resultSchema = z.object({
  id: z.coerce.string(),
  tournament_name_text: z.string(),
  event_name: z.string(),
  event_type: z.enum(["singles", "doubles", "team", "unknown"]).nullable(),
  division_system: divisionSystemSchema.nullish(),
  division_value: z.string().nullable(),
  rank_text: z.string().nullable(),
  club_text: z.string().nullable(),
  source_url: z.string().url(),
  source_code: sourceCodeSchema,
  source_name: z.string(),
  tournament_scale: z.enum([
    "national",
    "province",
    "district",
    "club",
    "unknown",
  ]),
  tournament_date: z.string().nullable(),
  source_published_date: z.string().nullish(),
  sort_date: z.string().nullish(),
  last_checked_at: z.string(),
  first_seen_at: z.string(),
});
const candidateResultSchema = resultSchema.extend({
  player_public_id: z.coerce.string(),
});
const sourceStatusSchema = z.object({
  code: sourceCodeSchema,
  display_name: z.string(),
  base_url: z.string().url(),
  adapter_mode: z.enum(["http", "browser", "manual"]),
  enabled: z.boolean(),
  parser_version: z.string(),
});

function toSummary(row: z.infer<typeof summarySchema>): PlayerSummary {
  const awardResults = row.award_results?.map((award) => ({
    rank: award.rank,
    ...(award.date ? { date: award.date } : {}),
  }));
  const divisionObservations = row.division_observations?.map(
    (observation) => ({
      system: observation.system,
      division: observation.division,
      awardCount: observation.award_count,
      participationCount: observation.participation_count,
    }),
  );
  return {
    id: row.id,
    name: row.canonical_name,
    normalizedName: row.normalized_name,
    ...(row.primary_region ? { region: row.primary_region } : {}),
    ...(row.primary_club ? { club: row.primary_club } : {}),
    ...(row.recent_observed_division
      ? { recentObservedDivision: row.recent_observed_division }
      : {}),
    ...(row.recent_observed_division_system
      ? { recentObservedDivisionSystem: row.recent_observed_division_system }
      : {}),
    resultCount: row.result_count,
    ...(awardResults?.length ? { awardResults } : {}),
    ...(divisionObservations ? { divisionObservations } : {}),
    sourceCount: row.source_count,
    lastCheckedAt: row.last_checked_at,
    identityStatus: row.identity_status,
    dataKind: "live",
  };
}

type ResultRow = z.infer<typeof resultSchema>;

function resultRowDate(row: ResultRow): string | undefined {
  return (
    row.tournament_date ??
    row.source_published_date ??
    row.sort_date ??
    undefined
  );
}

function toPlayerRecord(row: ResultRow): PlayerRecord {
  const date = resultRowDate(row);
  return {
    id: row.id,
    ...(date ? { date } : {}),
    ...(row.tournament_date
      ? { dateBasis: "tournament" as const }
      : row.source_published_date
        ? { dateBasis: "published" as const }
        : {}),
    tournament: row.tournament_name_text,
    scale: row.tournament_scale,
    event: row.event_name,
    ...(row.club_text ? { club: row.club_text } : {}),
    ...(row.division_value ? { division: row.division_value } : {}),
    ...(row.division_system ? { divisionSystem: row.division_system } : {}),
    ...(row.rank_text ? { rank: row.rank_text } : {}),
    sourceCode: row.source_code,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    lastCheckedAt: row.last_checked_at,
  };
}

export class SupabasePlayerRepository implements PlayerRepository {
  constructor(private readonly client: SupabaseClient) {}
  async listSourceStatuses() {
    const { data, error } = await this.client
      .from("public_source_status")
      .select("code,display_name,base_url,adapter_mode,enabled,parser_version")
      .neq("code", "mock")
      .neq("code", "band")
      .order("display_name");
    if (error) throw error;
    return z
      .array(sourceStatusSchema)
      .parse(data)
      .map((source) => ({
        sourceCode: source.code,
        displayName: source.display_name,
        baseUrl: source.base_url,
        adapterMode: source.adapter_mode,
        enabled: source.enabled,
        parserVersion: source.parser_version,
      }));
  }
  async searchPlayers(input: PlayerSearchInput): Promise<PlayerSummary[]> {
    const query = normalizePlayerName(input.query).replaceAll("%", "");
    let request = this.client
      .from("public_player_search")
      .select("*")
      .ilike("normalized_name", `${query}%`);
    if (input.region)
      request = request.ilike(
        "primary_region",
        `%${input.region.replaceAll("%", "").replaceAll("_", "")}%`,
      );
    const { data, error } = await request.limit(30);
    if (error) throw error;
    return z.array(summarySchema).parse(data).map(toSummary);
  }
  async getPlayer(id: string): Promise<PlayerDetail | null> {
    const [summaryResponse, recordsResponse] = await Promise.all([
      this.client
        .from("public_player_search")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      this.client
        .from("public_results")
        .select("*")
        .eq("player_public_id", id)
        .order("tournament_date", { ascending: false, nullsFirst: false })
        .order("last_checked_at", { ascending: false })
        .limit(100),
    ]);
    if (summaryResponse.error) throw summaryResponse.error;
    if (!summaryResponse.data) return null;
    if (recordsResponse.error) throw recordsResponse.error;
    const summary = toSummary(summarySchema.parse(summaryResponse.data));
    const rows = z.array(resultSchema).parse(recordsResponse.data);
    const records = sortPlayerRecordsByLatest(rows.map(toPlayerRecord));
    const sourceGroups = new Map<string, typeof rows>();
    for (const row of rows)
      sourceGroups.set(row.source_code, [
        ...(sourceGroups.get(row.source_code) ?? []),
        row,
      ]);
    const sources: SourceComparison[] = [...sourceGroups.values()].map(
      (group) => {
        const sortedGroup = [...group].sort(
          (left, right) =>
            (resultRowDate(right) ?? "").localeCompare(
              resultRowDate(left) ?? "",
            ) || right.last_checked_at.localeCompare(left.last_checked_at),
        );
        const latest = sortedGroup[0];
        if (!latest) throw new Error("source group cannot be empty");
        const latestAward = sortedGroup.find((row) =>
          isAwardRank(row.rank_text ?? undefined),
        )?.rank_text;
        const latestRecordDate = resultRowDate(latest);
        return {
          sourceCode: latest.source_code,
          sourceName: latest.source_name,
          ...(latestRecordDate ? { latestRecordDate } : {}),
          ...(latest.club_text ? { latestClub: latest.club_text } : {}),
          ...(latest.division_value
            ? { recentObservedDivision: latest.division_value }
            : {}),
          ...(latest.division_system
            ? { recentObservedDivisionSystem: latest.division_system }
            : {}),
          resultCount: sortedGroup.filter((row) =>
            isAwardRank(row.rank_text ?? undefined),
          ).length,
          ...(latestAward ? { latestRank: latestAward } : {}),
          lastCheckedAt: latest.last_checked_at,
          status: "fresh",
        };
      },
    );
    return { ...summary, records, sources };
  }
  async getIdentityCandidateEvidence(
    candidateIds: readonly string[],
  ): Promise<IdentityCandidateEvidence[]> {
    if (candidateIds.length === 0) return [];
    const uniqueIds = [...new Set(candidateIds)].slice(0, 30);
    const { data, error } = await this.client
      .from("public_results")
      .select("*")
      .in("player_public_id", uniqueIds)
      .order("sort_date", { ascending: false, nullsFirst: false })
      .order("last_checked_at", { ascending: false })
      .limit(1_000);
    if (error) throw error;
    const rows = z.array(candidateResultSchema).parse(data);
    const recordsByCandidate = new Map<string, PlayerRecord[]>();
    for (const row of rows) {
      const records = recordsByCandidate.get(row.player_public_id) ?? [];
      records.push(toPlayerRecord(row));
      recordsByCandidate.set(row.player_public_id, records);
    }
    return uniqueIds.map((candidateId) => ({
      candidateId,
      records: sortPlayerRecordsByLatest(
        recordsByCandidate.get(candidateId) ?? [],
      ).slice(0, 2),
    }));
  }
  async requestRefresh(input: RefreshRequest) {
    const { data, error } = await this.client.functions.invoke(
      "refresh-player",
      { body: input },
    );
    if (error) throw error;
    const parsed = z
      .object({
        refreshId: z.union([z.string(), z.number()]),
        sources: z.array(
          z.object({
            sourceCode: sourceCodeSchema,
            status: z.enum(["succeeded", "failed", "skipped"]),
            inserted: z.number().optional(),
            updated: z.number().optional(),
            unchanged: z.number().optional(),
            found: z.number().optional(),
            reason: z.string().optional(),
            errorCode: z.string().optional(),
            message: z.string().optional(),
            retryAfterMs: z.number().int().nonnegative().max(60_000).optional(),
          }),
        ),
      })
      .parse(data);
    return {
      refreshId: String(parsed.refreshId),
      accepted: true,
      recordsFound: parsed.sources.reduce(
        (sum, source) => sum + (source.found ?? source.inserted ?? 0),
        0,
      ),
      sources: parsed.sources,
    };
  }
  async getRefreshStatus(refreshId: string) {
    const { data, error } = await this.client.functions.invoke(
      "refresh-status",
      { body: { refreshId } },
    );
    if (error) throw error;
    return z
      .object({
        refreshId: z.string(),
        state: z.enum(["running", "completed", "partial"]),
      })
      .parse(data);
  }
  async submitIdentityClaim(input: IdentityClaimInput) {
    const { data, error } = await this.client.functions.invoke(
      "submit-identity-claim",
      { body: input },
    );
    if (error) throw error;
    return z
      .object({
        accepted: z.boolean(),
        referenceId: z.string().min(1),
        status: z.literal("pending"),
      })
      .parse(data);
  }
}

export function createSupabaseRepository(url: string, anonKey: string) {
  return new SupabasePlayerRepository(createClient(url, anonKey));
}
