import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  divisionSystemSchema,
  isAwardRank,
  isHomonymNickname,
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
  IdentityEditHistoryEntry,
  IdentityEditInput,
  PlayerRepository,
  PlayerSearchInput,
  RefreshRequest,
  RevertIdentityEditInput,
} from "./repository";

const homonymNicknameSchema = z.custom<string>(
  (value) => typeof value === "string" && isHomonymNickname(value),
  "알 수 없는 동명이인 별칭입니다.",
);

const identityEditErrorMessages: Readonly<Record<string, string>> = {
  rate_limited: "편집 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  candidate_name_mismatch:
    "선택한 기록의 선수가 서로 다르거나 더 이상 유효하지 않습니다. 검색 결과를 새로고침해 주세요.",
  stale_candidates:
    "선택한 기록이 최근 편집으로 변경되었습니다. 검색 결과를 새로고침해 주세요.",
  unauthorized: "편집 요청을 인증하지 못했습니다. 페이지를 새로고침해 주세요.",
  server_not_configured:
    "편집 서버 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
  invalid_request: "별칭이나 선택한 기록을 확인한 뒤 다시 시도해 주세요.",
};

async function identityEditError(error: unknown): Promise<Error> {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const payload = z
        .object({ error: z.string() })
        .safeParse(await error.context.clone().json());
      if (payload.success)
        return new Error(
          identityEditErrorMessages[payload.data.error] ??
            "편집을 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
    } catch {
      // Fall through to the safe public message below.
    }
  }
  return new Error(
    "편집 서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
  );
}

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
  homonym_nickname: homonymNicknameSchema.nullish(),
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
type CandidateResultRow = z.infer<typeof candidateResultSchema>;
const sourceStatusSchema = z.object({
  code: sourceCodeSchema,
  display_name: z.string(),
  base_url: z.string().url(),
  adapter_mode: z.enum(["http", "browser", "manual"]),
  enabled: z.boolean(),
  parser_version: z.string(),
});
const identityEditCandidateSchema = z.object({
  player_id: z.coerce.string(),
  name: z.string(),
  region: z.string().nullable(),
  club: z.string().nullable(),
  group_nickname: homonymNicknameSchema.nullish(),
});
const identityEditHistorySchema = z.object({
  operation_id: z.coerce.string(),
  reference_id: z.string().min(1),
  normalized_name: z.string(),
  status: z.enum(["applied", "reverted"]),
  target_player_id: z.coerce.string(),
  target_player_name: z.string(),
  reason: z.string(),
  created_at: z.string(),
  reverted_at: z.string().nullable(),
  revert_reason: z.string().nullable(),
  can_revert: z.boolean(),
  candidates: z.array(identityEditCandidateSchema),
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
    ...(row.homonym_nickname ? { homonymNickname: row.homonym_nickname } : {}),
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
    const pageSize = 200;
    const rows: z.infer<typeof summarySchema>[] = [];
    for (let offset = 0; ; offset += pageSize) {
      let request = this.client
        .from("public_player_search")
        .select("*")
        .ilike("normalized_name", `${query}%`)
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (input.region)
        request = request.ilike(
          "primary_region",
          `%${input.region.replaceAll("%", "").replaceAll("_", "")}%`,
        );
      const { data, error } = await request;
      if (error) throw error;
      const page = z.array(summarySchema).parse(data);
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows.map(toSummary);
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
    const uniqueIds = [...new Set(candidateIds)];
    const batches = Array.from(
      { length: Math.ceil(uniqueIds.length / 100) },
      (_, index) => uniqueIds.slice(index * 100, (index + 1) * 100),
    );
    const rows: CandidateResultRow[] = [];
    const failedCandidateIds = new Set<string>();
    const fetchBatch = async (batch: readonly string[]) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data, error } = await this.client.rpc(
          "list_identity_candidate_evidence",
          { p_player_public_ids: batch },
        );
        if (!error) return z.array(candidateResultSchema).parse(data);
      }
      const { data, error } = await this.client
        .from("public_results")
        .select("*")
        .in("player_public_id", batch)
        .order("sort_date", { ascending: false, nullsFirst: false })
        .order("last_checked_at", { ascending: false })
        .limit(1_000);
      if (!error) return z.array(candidateResultSchema).parse(data);
      for (const candidateId of batch) failedCandidateIds.add(candidateId);
      return [];
    };
    for (let index = 0; index < batches.length; index += 3) {
      const batchRows = await Promise.all(
        batches.slice(index, index + 3).map(fetchBatch),
      );
      rows.push(...batchRows.flat());
    }
    const recordsByCandidate = new Map<string, PlayerRecord[]>();
    for (const row of rows) {
      const records = recordsByCandidate.get(row.player_public_id) ?? [];
      records.push(toPlayerRecord(row));
      recordsByCandidate.set(row.player_public_id, records);
    }
    return uniqueIds.map((candidateId) => ({
      candidateId,
      status: failedCandidateIds.has(candidateId)
        ? ("error" as const)
        : ("loaded" as const),
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
  async applyIdentityEdit(input: IdentityEditInput) {
    const { data, error } = await this.client.functions.invoke(
      "submit-identity-claim",
      { body: input },
    );
    if (error) throw await identityEditError(error);
    return z
      .object({
        accepted: z.boolean(),
        referenceId: z.string().min(1),
        operationId: z.string().uuid(),
        status: z.literal("applied"),
        groupCount: z.number().int().min(1),
      })
      .parse(data);
  }
  async listIdentityEditHistory(
    normalizedName: string,
  ): Promise<IdentityEditHistoryEntry[]> {
    const { data, error } = await this.client.rpc(
      "list_identity_edit_history",
      { p_normalized_name: normalizePlayerName(normalizedName) },
    );
    if (error) throw error;
    return z
      .array(identityEditHistorySchema)
      .parse(data)
      .map((entry) => ({
        operationId: entry.operation_id,
        referenceId: entry.reference_id,
        normalizedName: entry.normalized_name,
        status: entry.status,
        targetPlayerId: entry.target_player_id,
        targetPlayerName: entry.target_player_name,
        reason: entry.reason,
        createdAt: entry.created_at,
        ...(entry.reverted_at ? { revertedAt: entry.reverted_at } : {}),
        ...(entry.revert_reason ? { revertReason: entry.revert_reason } : {}),
        canRevert: entry.can_revert,
        candidates: entry.candidates.map((candidate) => ({
          playerId: candidate.player_id,
          name: candidate.name,
          ...(candidate.region ? { region: candidate.region } : {}),
          ...(candidate.club ? { club: candidate.club } : {}),
          ...(candidate.group_nickname
            ? { groupNickname: candidate.group_nickname }
            : {}),
        })),
      }));
  }
  async revertIdentityEdit(input: RevertIdentityEditInput) {
    const { data, error } = await this.client.functions.invoke(
      "revert-identity-edit",
      { body: input },
    );
    if (error) throw error;
    return z
      .object({
        reverted: z.boolean(),
        operationId: z.string().uuid(),
        status: z.literal("reverted"),
      })
      .parse(data);
  }
}

export function createSupabaseRepository(url: string, anonKey: string) {
  return new SupabasePlayerRepository(createClient(url, anonKey));
}
