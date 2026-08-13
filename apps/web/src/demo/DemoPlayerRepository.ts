import {
  isAwardRank,
  normalizeSearchText,
  sortPlayerRecordsByLatest,
  summarizeDivisionObservations,
  type SourceStatus,
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
} from "../lib/repository";
import { demoPlayers } from "./data";

export class DemoPlayerRepository implements PlayerRepository {
  async listSourceStatuses(): Promise<SourceStatus[]> {
    return [
      {
        sourceCode: "astree",
        displayName: "애즈트리",
        baseUrl: "https://astree.co.kr/",
        adapterMode: "http",
        enabled: true,
        parserVersion: "astree-4",
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
        parserVersion: "airping-2",
      },
      {
        sourceCode: "okpingpong",
        displayName: "오케이핑퐁",
        baseUrl: "http://okpingpong.co.kr/",
        adapterMode: "http",
        enabled: false,
        parserVersion: "okpingpong-2",
      },
      {
        sourceCode: "mytt",
        displayName: "마이티티",
        baseUrl: "https://mytt.kr/",
        adapterMode: "http",
        enabled: true,
        parserVersion: "mytt-2",
      },
      {
        sourceCode: "superstar",
        displayName: "슈퍼스타탁구",
        baseUrl: "https://www.superstar.kr/open/Do.jsp?urlSeq=302",
        adapterMode: "http",
        enabled: true,
        parserVersion: "superstar-1",
      },
      {
        sourceCode: "yongintt",
        displayName: "용인탁구협회 다음 카페",
        baseUrl: "https://cafe.daum.net/yongintt",
        adapterMode: "http",
        enabled: false,
        parserVersion: "yongintt-2",
      },
      {
        sourceCode: "iping",
        displayName: "아이핑",
        baseUrl: "https://www.iping.club/?pg=Search",
        adapterMode: "http",
        enabled: false,
        parserVersion: "iping-1",
      },
    ];
  }
  async searchPlayers(input: PlayerSearchInput) {
    const query = normalizeSearchText(input.query);
    return demoPlayers
      .filter(
        (player) =>
          [
            player.normalizedName,
            normalizeSearchText(player.club ?? ""),
            normalizeSearchText(player.region ?? ""),
          ].some((value) => value.startsWith(query)) &&
          (!input.region || player.region?.includes(input.region)) &&
          (!input.club || player.club === input.club) &&
          (!input.sourceCode ||
            player.sources.some(
              (source) => source.sourceCode === input.sourceCode,
            )),
      )
      .map((player) => ({
        id: player.id,
        name: player.name,
        normalizedName: player.normalizedName,
        ...(player.region ? { region: player.region } : {}),
        ...(player.club ? { club: player.club } : {}),
        ...(player.recentObservedDivision
          ? { recentObservedDivision: player.recentObservedDivision }
          : {}),
        ...(player.recentObservedDivisionSystem
          ? {
              recentObservedDivisionSystem: player.recentObservedDivisionSystem,
            }
          : {}),
        resultCount: player.resultCount,
        awardResults: player.records
          .filter((record) => isAwardRank(record.rank))
          .flatMap((record) =>
            record.rank
              ? [
                  {
                    rank: record.rank,
                    ...(record.date ? { date: record.date } : {}),
                  },
                ]
              : [],
          ),
        divisionObservations: summarizeDivisionObservations(player.records),
        sourceCount: player.sourceCount,
        lastCheckedAt: player.lastCheckedAt,
        identityStatus: player.identityStatus,
        ...(player.homonymNickname
          ? { homonymNickname: player.homonymNickname }
          : {}),
      }));
  }
  async getPlayer(id: string) {
    const player = demoPlayers.find((candidate) => candidate.id === id);
    return player
      ? { ...player, records: sortPlayerRecordsByLatest(player.records) }
      : null;
  }
  async getIdentityCandidateEvidence(
    candidateIds: readonly string[],
  ): Promise<IdentityCandidateEvidence[]> {
    return [...new Set(candidateIds)].map((candidateId) => {
      const player = demoPlayers.find(
        (candidate) => candidate.id === candidateId,
      );
      return {
        candidateId,
        status: "loaded" as const,
        records: player
          ? sortPlayerRecordsByLatest(player.records).slice(0, 2)
          : [],
      };
    });
  }
  async requestRefresh(input: RefreshRequest): Promise<RefreshResponse> {
    return {
      refreshId: `demo-${Date.now()}`,
      accepted: true,
      recordsFound: 0,
      candidatesFound: 0,
      sources: (input.sourceCodes ?? []).map((sourceCode) => ({
        sourceCode,
        status: "skipped",
        reason: "demo_mode",
      })),
    };
  }
  async getRefreshStatus(refreshId: string): Promise<RefreshStatus> {
    return { refreshId, state: "partial" };
  }
  async applyIdentityEdit(
    input: IdentityEditInput,
  ): Promise<IdentityEditResponse> {
    return {
      accepted: true,
      referenceId: "DEMO-EDIT",
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
