import { z } from "zod";
import {
  divisionSystemSchema,
  isHomonymNickname,
  type PlayerDetail,
  type PlayerSummary,
  type SourceStatus,
  type TrendingPlayers,
} from "@busu/domain";
import type {
  IdentityCandidateEvidence,
  IdentityEditHistoryEntry,
  IdentityEditInput,
  IdentityEditResponse,
  PlayerRepository,
  PlayerSearchInput,
  RefreshRequest,
  RefreshResponse,
  RefreshStatus,
  RevertIdentityEditInput,
  RevertIdentityEditResponse,
} from "./repository";

const homonymNicknameSchema = z.custom<string>(
  (value) => typeof value === "string" && isHomonymNickname(value),
);

const summarySchema = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  region: z.string().optional(),
  club: z.string().optional(),
  recentObservedDivision: z.string().optional(),
  recentObservedDivisionSystem: divisionSystemSchema.optional(),
  resultCount: z.number(),
  awardResults: z
    .array(
      z.object({
        rank: z.string(),
        date: z.string().optional(),
        tournament: z.string().optional(),
        event: z.string().optional(),
        lastCheckedAt: z.string().optional(),
        sourceCount: z.number().int().positive().optional(),
      }),
    )
    .optional(),
  latestParticipationDate: z.string().optional(),
  latestParticipationTournament: z.string().optional(),
  latestParticipationEvent: z.string().optional(),
  latestParticipationCheckedAt: z.string().optional(),
  divisionObservations: z
    .array(
      z.object({
        system: divisionSystemSchema,
        division: z.string().min(1),
        awardCount: z.number().int().nonnegative(),
        participationCount: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  sourceCount: z.number(),
  lastCheckedAt: z.string(),
  identityStatus: z.enum(["unreviewed", "likely", "verified", "disputed"]),
  homonymNickname: homonymNicknameSchema.optional(),
  dataKind: z.literal("live").optional(),
});

export class DevLivePlayerRepository implements PlayerRepository {
  async listSourceStatuses(): Promise<SourceStatus[]> {
    return [
      {
        sourceCode: "astree",
        displayName: "애즈트리",
        baseUrl: "https://astree.co.kr/",
        adapterMode: "http",
        enabled: true,
        parserVersion: "astree-6",
      },
      {
        sourceCode: "ttadivision",
        displayName: "대한탁구협회 디비전",
        baseUrl: "https://ttadivision.sports.or.kr/",
        adapterMode: "http",
        enabled: true,
        parserVersion: "ttadivision-1",
      },
      {
        sourceCode: "airping",
        displayName: "에어핑퐁",
        baseUrl: "https://airping.co.kr/",
        adapterMode: "http",
        enabled: false,
        parserVersion: "airping-3",
      },
      {
        sourceCode: "okpingpong",
        displayName: "오케이핑퐁",
        baseUrl: "http://okpingpong.co.kr/",
        adapterMode: "http",
        enabled: false,
        parserVersion: "okpingpong-4",
      },
      {
        sourceCode: "mytt",
        displayName: "마이티티",
        baseUrl: "https://mytt.kr/",
        adapterMode: "http",
        enabled: true,
        parserVersion: "mytt-3",
      },
      {
        sourceCode: "superstar",
        displayName: "슈퍼스타탁구",
        baseUrl: "https://www.superstar.kr/open/Do.jsp?urlSeq=302",
        adapterMode: "http",
        enabled: true,
        parserVersion: "superstar-2",
      },
      {
        sourceCode: "iping",
        displayName: "아이핑",
        baseUrl: "https://www.iping.club/?pg=Search",
        adapterMode: "http",
        enabled: false,
        parserVersion: "iping-5",
      },
    ];
  }
  async listTrendingPlayers(): Promise<TrendingPlayers> {
    // Local live search has no shared view counter to aggregate.
    return { updatedAt: new Date().toISOString(), players: [] };
  }
  async recordPlayerView(): Promise<void> {
    // Local live search never writes view counts.
  }
  async searchPlayers(input: PlayerSearchInput): Promise<PlayerSummary[]> {
    const response = await fetch(
      `/api/dev/players?query=${encodeURIComponent(input.query)}`,
    );
    if (!response.ok)
      throw new Error("개발용 저장 결과를 불러오지 못했습니다.");
    return z
      .array(summarySchema)
      .parse(await response.json())
      .filter((row) => !input.region || row.region?.includes(input.region))
      .map((row) => {
        const awardResults = row.awardResults?.map((award) => ({
          rank: award.rank,
          ...(award.date ? { date: award.date } : {}),
          ...(award.tournament ? { tournament: award.tournament } : {}),
          ...(award.event ? { event: award.event } : {}),
          ...(award.lastCheckedAt
            ? { lastCheckedAt: award.lastCheckedAt }
            : {}),
          ...(award.sourceCount ? { sourceCount: award.sourceCount } : {}),
        }));
        return {
          id: row.id,
          name: row.name,
          normalizedName: row.normalizedName,
          ...(row.region ? { region: row.region } : {}),
          ...(row.club ? { club: row.club } : {}),
          ...(row.recentObservedDivision
            ? { recentObservedDivision: row.recentObservedDivision }
            : {}),
          ...(row.recentObservedDivisionSystem
            ? { recentObservedDivisionSystem: row.recentObservedDivisionSystem }
            : {}),
          resultCount: row.resultCount,
          ...(awardResults ? { awardResults } : {}),
          ...(row.latestParticipationDate
            ? { latestParticipationDate: row.latestParticipationDate }
            : {}),
          ...(row.latestParticipationTournament
            ? {
                latestParticipationTournament:
                  row.latestParticipationTournament,
              }
            : {}),
          ...(row.latestParticipationEvent
            ? { latestParticipationEvent: row.latestParticipationEvent }
            : {}),
          ...(row.latestParticipationCheckedAt
            ? {
                latestParticipationCheckedAt: row.latestParticipationCheckedAt,
              }
            : {}),
          ...(row.divisionObservations
            ? { divisionObservations: row.divisionObservations }
            : {}),
          sourceCount: row.sourceCount,
          lastCheckedAt: row.lastCheckedAt,
          identityStatus: row.identityStatus,
          ...(row.homonymNickname
            ? { homonymNickname: row.homonymNickname }
            : {}),
          ...(row.dataKind ? { dataKind: row.dataKind } : {}),
        };
      });
  }
  async getPlayer(id: string): Promise<PlayerDetail | null> {
    const response = await fetch(`/api/dev/players/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error("개발용 선수 상세를 불러오지 못했습니다.");
    return (await response.json()) as PlayerDetail;
  }
  async getIdentityCandidateEvidence(
    candidateIds: readonly string[],
  ): Promise<IdentityCandidateEvidence[]> {
    return Promise.all(
      [...new Set(candidateIds)].map(async (candidateId) => {
        const player = await this.getPlayer(candidateId);
        return {
          candidateId,
          status: "loaded" as const,
          records: player?.records.slice(0, 2) ?? [],
        };
      }),
    );
  }
  async requestRefresh(input: RefreshRequest): Promise<RefreshResponse> {
    const sourceCode = input.sourceCodes?.[0] ?? "astree";
    if (sourceCode !== "astree")
      return {
        refreshId: `dev-${sourceCode}-${Date.now()}`,
        accepted: true,
        recordsFound: 0,
        sources: [{ sourceCode, status: "skipped", reason: "source_disabled" }],
      };
    const response = await fetch("/api/dev/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.name, force: input.force ?? false }),
    });
    if (!response.ok)
      throw new Error("애즈트리 공개 기록 갱신에 실패했습니다.");
    const parsed = z
      .object({
        refreshId: z.string(),
        accepted: z.boolean(),
        recordsFound: z.number().optional(),
        candidatesFound: z.number().optional(),
      })
      .parse(await response.json());
    return {
      refreshId: parsed.refreshId,
      accepted: parsed.accepted,
      ...(parsed.recordsFound !== undefined
        ? { recordsFound: parsed.recordsFound }
        : {}),
      ...(parsed.candidatesFound !== undefined
        ? { candidatesFound: parsed.candidatesFound }
        : {}),
      sources: [
        {
          sourceCode: "astree",
          status: "succeeded",
          ...(parsed.recordsFound !== undefined
            ? { found: parsed.recordsFound }
            : {}),
        },
      ],
    };
  }
  async getRefreshStatus(refreshId: string): Promise<RefreshStatus> {
    return { refreshId, state: "completed" };
  }
  async applyIdentityEdit(
    input: IdentityEditInput,
  ): Promise<IdentityEditResponse> {
    return {
      accepted: true,
      referenceId: "DEV-EDIT",
      operationId: "00000000-0000-4000-8000-000000000001",
      status: "applied",
      groupCount: input.groups.length,
    };
  }
  async listIdentityEditHistory(
    normalizedName: string,
  ): Promise<IdentityEditHistoryEntry[]> {
    void normalizedName;
    return [];
  }
  async revertIdentityEdit(
    input: RevertIdentityEditInput,
  ): Promise<RevertIdentityEditResponse> {
    return {
      reverted: true,
      operationId: input.operationId,
      status: "reverted",
    };
  }
}
