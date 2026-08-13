import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  createContentHash,
  createNaturalKeyHash,
  decideRecordUpsert,
  mayAutoMerge,
  normalizeClubName,
  normalizePlayerName,
  parsePlayerName,
  withRecordHashes,
  isAwardRank,
  inferKoreanRegion,
  inferDivisionSystem,
  inferEventDivisionSystem,
  formatDivisionObservation,
  parseDivisionSystem,
  parsePlayerSearchQuery,
  sortPlayerRecordsByLatest,
  summarizeDivisionObservations,
  type PlayerRecord,
  type RecordHashInput,
} from "./index";

const base: RecordHashInput = {
  sourceCode: "mock",
  externalPlayerId: "m-1",
  playerName: "김탁구",
  normalizedPlayerName: "김탁구",
  clubText: "스핀 탁구클럽",
  region: "서울",
  tournamentName: "가상 오픈",
  tournamentDate: "2026-07-01",
  eventName: "남자 단식",
  eventType: "singles",
  divisionSystem: "regional",
  divisionValue: "5부",
  rankText: "우승",
  sourceUrl: "https://example.invalid/result/1",
  observedAt: "2026-08-12T00:00:00.000Z",
};

describe("normalization and hashes", () => {
  it("normalizes Korean and English names and clubs", () => {
    expect(normalizePlayerName(" 김 민 수 ")).toBe("김민수");
    expect(normalizePlayerName("Kim Min Su")).toBe("kimminsu");
    expect(normalizeClubName(" 스핀  탁구클럽 ")).toBe("스핀탁구클럽");
  });
  it("extracts an optional division candidate", () => {
    expect(parsePlayerName("김민수(5부)")).toMatchObject({
      name: "김민수",
      divisionCandidate: "5부",
    });
    expect(parsePlayerName("김민수(서울)")).not.toHaveProperty(
      "divisionCandidate",
    );
  });
  it("canonicalizes object field order", () => {
    expect(canonicalJson({ b: "값", a: 1 })).toBe(
      canonicalJson({ a: 1, b: "값" }),
    );
  });
  it("keeps hashes stable across whitespace and unicode compatibility forms", () => {
    expect(createNaturalKeyHash(base)).toBe(
      createNaturalKeyHash({ ...base, tournamentName: "가상  오픈" }),
    );
    expect(createContentHash(base)).toBe(
      createContentHash({ ...base, clubText: "스핀  탁구클럽" }),
    );
  });
  it("supports records without dates and external ids", () => {
    const without: RecordHashInput = { ...base };
    delete without.tournamentDate;
    delete without.externalPlayerId;
    expect(createNaturalKeyHash(without)).toHaveLength(16);
  });
});

describe("division presentation", () => {
  it("presents women event divisions as integrated women divisions", () => {
    expect(formatDivisionObservation("women", "6부")).toBe("통합부수 여자6부");
    expect(formatDivisionObservation("integrated", "6부")).toBe("통합부수 6부");
    expect(formatDivisionObservation("women", "NULL부")).toBe(
      "통합부수 확인 필요",
    );
    expect(formatDivisionObservation("women", "null")).toBe(
      "통합부수 확인 필요",
    );
  });

  it("counts awards and participation separately for each observed division", () => {
    expect(
      summarizeDivisionObservations([
        { divisionSystem: "open", division: "6부", rank: "우승" },
        { divisionSystem: "open", division: "6부", rank: "8강" },
        { divisionSystem: "integrated", division: "6부" },
        { divisionSystem: "division", division: "T4", rank: "4강" },
        { divisionSystem: "regional", rank: "3위" },
      ]),
    ).toEqual([
      { system: "open", division: "6부", awardCount: 1, participationCount: 1 },
      {
        system: "integrated",
        division: "6부",
        awardCount: 0,
        participationCount: 1,
      },
      {
        system: "division",
        division: "T4",
        awardCount: 1,
        participationCount: 0,
      },
    ]);
  });
});

describe("diff and identity", () => {
  it("handles insert, unchanged and changed revisions", () => {
    const first = withRecordHashes(base);
    expect(decideRecordUpsert(undefined, first).kind).toBe("insert");
    expect(decideRecordUpsert(first, first).kind).toBe("unchanged");
    for (const [field, value] of [
      ["divisionValue", "4부"],
      ["clubText", "새 클럽"],
      ["rankText", "준우승"],
    ] as const) {
      const next = withRecordHashes({ ...base, [field]: value });
      const decision = decideRecordUpsert(first, next);
      expect(decision.kind).toBe("update");
      if (decision.kind === "update")
        expect(decision.changedFields).toContain(field);
    }
  });
  it("never merges identity candidates by name only", () => {
    const player = {
      id: "1",
      name: "김탁구",
      normalizedName: "김탁구",
      resultCount: 0,
      sourceCount: 1,
      lastCheckedAt: "",
      identityStatus: "unreviewed" as const,
    };
    expect(mayAutoMerge(player, { ...player, id: "2" })).toBe(false);
  });
  it("separates award results from bracket progress", () => {
    expect(isAwardRank("우승")).toBe(true);
    expect(isAwardRank("준우승")).toBe(true);
    expect(isAwardRank("공동 3위")).toBe(true);
    expect(isAwardRank("본선 공동 3위")).toBe(true);
    expect(isAwardRank("본선 4강")).toBe(true);
    expect(isAwardRank("본선 ４강")).toBe(true);
    expect(isAwardRank("4강전 진출")).toBe(true);
    expect(isAwardRank("본선 2강")).toBe(true);
    expect(isAwardRank("본선 8강")).toBe(false);
    expect(isAwardRank("본선 16강")).toBe(false);
    expect(isAwardRank("본선 64강")).toBe(false);
    expect(isAwardRank("본선 128강")).toBe(false);
    expect(isAwardRank("예선 2조")).toBe(false);
    expect(isAwardRank("예선 12조 3위")).toBe(false);
    expect(isAwardRank("조별 1위")).toBe(false);
    expect(isAwardRank("참가")).toBe(false);
  });
});

describe("Korean region inference", () => {
  it("normalizes conservative province, city, and district evidence", () => {
    expect(inferKoreanRegion("2025 여주쌀배 전국 생활체육 탁구 페스티벌")).toBe(
      "경기도 여주시",
    );
    expect(inferKoreanRegion("제14회 안동시장배 전국오픈 탁구대회")).toBe(
      "경상북도 안동시",
    );
    expect(inferKoreanRegion("제13회 인천광역시중구협회장배 탁구대회")).toBe(
      "인천광역시 중구",
    );
    expect(inferKoreanRegion("전국오픈 탁구대회", "경기도 남자 단식")).toBe(
      "경기도",
    );
    expect(inferKoreanRegion("2026 충청남도 예산군 탁구협회장배")).toBe(
      "충청남도 예산군",
    );
    expect(inferKoreanRegion("2026 부천시 전국오픈 탁구대회")).toBe(
      "경기도 부천시",
    );
    expect(inferKoreanRegion("제3회 가람군 체육회장배 탁구대회")).toBe(
      "가람군",
    );
    expect(inferKoreanRegion("서울특별시 강남구청장배 탁구대회")).toBe(
      "서울특별시 강남구",
    );
  });

  it("does not guess from ambiguous or non-regional tournament names", () => {
    expect(
      inferKoreanRegion("제13회 남한산성배 생활체육 전국오픈탁구대회"),
    ).toBeUndefined();
    expect(
      inferKoreanRegion("제7회 윤봉길배 전국오픈 탁구대회"),
    ).toBeUndefined();
  });
});

describe("player search query", () => {
  it("separates a player name from an optional region filter", () => {
    expect(parsePlayerSearchQuery("김미진")).toEqual({ name: "김미진" });
    expect(parsePlayerSearchQuery(" 김미진   용인 ")).toEqual({
      name: "김미진",
      region: "용인",
    });
    expect(parsePlayerSearchQuery("김미진 경기도 용인시")).toEqual({
      name: "김미진",
      region: "경기도 용인시",
    });
  });
});

describe("division system inference", () => {
  it("uses open only when explicit and defaults ordinary numeric busu to integrated", () => {
    expect(inferDivisionSystem("전국오픈 탁구대회")).toBe("open");
    expect(inferDivisionSystem("통합 6부 개인단식")).toBe("integrated");
    expect(inferDivisionSystem("여자 4부 개인단식")).toBe("women");
    expect(inferDivisionSystem("수원시 협회장배", "6부")).toBe("integrated");
    expect(inferDivisionSystem("서울특별시 강남구청장배", "5부")).toBe(
      "integrated",
    );
    expect(inferDivisionSystem("지역부수 4부")).toBe("regional");
    expect(inferDivisionSystem("탁구 디비전리그", "T5")).toBe("division");
  });

  it("treats a women event name as a women division system", () => {
    expect(inferDivisionSystem("전국오픈대회", "여자 단식", "4부")).toBe(
      "women",
    );
    expect(inferDivisionSystem("전국대회", "남자 단식")).toBe("unknown");
    expect(parseDivisionSystem("전국오픈")).toBe("open");
    expect(parseDivisionSystem("디비전부수")).toBe("division");
  });

  it("treats local event categories inside an open tournament as integrated", () => {
    expect(inferEventDivisionSystem("지역", "전국오픈 탁구대회", "3부")).toBe(
      "integrated",
    );
    expect(inferEventDivisionSystem("지역남성 5부", "전국오픈 탁구대회")).toBe(
      "integrated",
    );
    expect(inferEventDivisionSystem("지역여성6부", "전국오픈 탁구대회")).toBe(
      "integrated",
    );
    expect(inferEventDivisionSystem("지역혼성3/4부", "전국오픈 탁구대회")).toBe(
      "integrated",
    );
    expect(
      inferEventDivisionSystem(
        "남자 단식",
        "수원 지역 전국오픈 탁구대회",
        "3부",
      ),
    ).toBe("open");
    expect(inferEventDivisionSystem("지역혼성 T5", "디비전리그")).toBe(
      "division",
    );
  });

  it("applies explicit tournament overrides before generic inference", () => {
    expect(inferDivisionSystem("제13회분당구청장기", "남자5부")).toBe(
      "regional",
    );
    expect(
      inferDivisionSystem("제14회 분당구청장기 생활체육 탁구대회", "직장1/4부"),
    ).toBe("regional");
    expect(
      inferDivisionSystem(
        "2023년 제16회 분당구청장기 탁구대회",
        "직장부",
        "3부",
      ),
    ).toBe("regional");
    expect(
      inferEventDivisionSystem("지역남성 3부", "제16회 분당구청장기 탁구대회"),
    ).toBe("regional");
    expect(
      inferDivisionSystem("제17회 분당구청장기 탁구대회", "직장부", "3부"),
    ).toBe("integrated");
    expect(
      inferDivisionSystem(
        "2018 분당구 내일은 탁구왕 탁구대회",
        "남자4부",
        "오픈",
      ),
    ).toBe("open");
  });
});

describe("record chronology", () => {
  const record = (
    id: string,
    date: string | undefined,
    lastCheckedAt: string,
  ): PlayerRecord => ({
    id,
    ...(date ? { date } : {}),
    tournament: `가상 대회 ${id}`,
    scale: "unknown",
    event: "단식",
    sourceCode: "mock",
    sourceName: "가상 출처",
    sourceUrl: `https://example.invalid/${id}`,
    lastCheckedAt,
  });

  it("sorts by tournament or published date before crawler observation time", () => {
    const records = [
      record("old-event-new-crawl", "2025-01-01", "2026-08-12T03:00:00.000Z"),
      {
        ...record("new-post", "2026-07-15", "2026-08-10T00:00:00.000Z"),
        dateBasis: "published" as const,
      },
      record("new-event", "2026-08-01", "2026-08-09T00:00:00.000Z"),
      record("unknown-date", undefined, "2026-08-12T04:00:00.000Z"),
    ];

    expect(sortPlayerRecordsByLatest(records).map(({ id }) => id)).toEqual([
      "new-event",
      "new-post",
      "old-event-new-crawl",
      "unknown-date",
    ]);
  });
});
