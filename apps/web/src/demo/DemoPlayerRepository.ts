import {
  findRecentObservedDivisionRecord,
  isAwardRank,
  isCurrentSummaryRecord,
  normalizeSearchText,
  normalizePlayerRecordDivisionSystem,
  sortPlayerRecordsByLatest,
  summarizeDivisionObservations,
  type PlayerDetail,
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

function latestParticipationSummary(player: PlayerDetail): {
  latestParticipationDate?: string;
  latestParticipationTournament?: string;
  latestParticipationEvent?: string;
  latestParticipationCheckedAt?: string;
} {
  const latestParticipation = sortPlayerRecordsByLatest(
    player.records.filter(
      (record) => !isAwardRank(record.rank) && isCurrentSummaryRecord(record),
    ),
  )[0];
  if (!latestParticipation) return {};
  return {
    ...(latestParticipation.date
      ? { latestParticipationDate: latestParticipation.date }
      : {}),
    latestParticipationTournament: latestParticipation.tournament,
    latestParticipationEvent: latestParticipation.event,
    latestParticipationCheckedAt: latestParticipation.lastCheckedAt,
  };
}

export class DemoPlayerRepository implements PlayerRepository {
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
        sourceCode: "newttplay",
        displayName: "뉴티티플레이",
        baseUrl:
          "https://www.newttplay.co.kr/bbs/board.php?bo_table=member_search",
        adapterMode: "http",
        enabled: false,
        parserVersion: "newttplay-2",
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
        sourceCode: "yongintt",
        displayName: "용인탁구협회 다음 카페",
        baseUrl: "https://cafe.daum.net/yongintt",
        adapterMode: "http",
        enabled: false,
        parserVersion: "yongintt-4",
      },
      {
        sourceCode: "iping",
        displayName: "아이핑",
        baseUrl: "https://www.iping.club/?pg=Search",
        adapterMode: "http",
        enabled: false,
        parserVersion: "iping-4",
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
      .map((player) => {
        const currentSummaryRecords = player.records.filter((record) =>
          isCurrentSummaryRecord(record),
        );
        const currentDivisionRecord = findRecentObservedDivisionRecord(
          currentSummaryRecords,
        );
        const currentAwardRecords = currentSummaryRecords.filter((record) =>
          isAwardRank(record.rank),
        );
        return {
          id: player.id,
          name: player.name,
          normalizedName: player.normalizedName,
          ...(player.region ? { region: player.region } : {}),
          ...(player.club ? { club: player.club } : {}),
          ...(currentDivisionRecord?.division
            ? { recentObservedDivision: currentDivisionRecord.division }
            : {}),
          ...(currentDivisionRecord?.divisionSystem
            ? {
                recentObservedDivisionSystem:
                  currentDivisionRecord.divisionSystem,
              }
            : {}),
          resultCount: currentAwardRecords.length,
          awardResults: currentAwardRecords.flatMap((record) =>
            record.rank
              ? [
                  {
                    rank: record.rank,
                    ...(record.date ? { date: record.date } : {}),
                    tournament: record.tournament,
                    event: record.event,
                    lastCheckedAt: record.lastCheckedAt,
                  },
                ]
              : [],
          ),
          ...latestParticipationSummary(player),
          divisionObservations: summarizeDivisionObservations(player.records),
          sourceCount: player.sourceCount,
          lastCheckedAt: player.lastCheckedAt,
          identityStatus: player.identityStatus,
          ...(player.homonymNickname
            ? { homonymNickname: player.homonymNickname }
            : {}),
        };
      });
  }
  async getPlayer(id: string) {
    const player = demoPlayers.find((candidate) => candidate.id === id);
    return player
      ? {
          ...player,
          records: sortPlayerRecordsByLatest(
            player.records.map(normalizePlayerRecordDivisionSystem),
          ),
        }
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
          ? sortPlayerRecordsByLatest(
              player.records.map(normalizePlayerRecordDivisionSystem),
            ).slice(0, 2)
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
