import { describe, expect, it } from "vitest";
import {
  normalizePlayerName,
  withRecordHashes,
  type RecordHashInput,
} from "@busu/domain";
import {
  InMemoryRecordRepository,
  RefreshJobDeduplicator,
  SourceDisabledError,
  mapSourceError,
  recordsToPlayerDetails,
} from "./index";

const record = (divisionValue: string): RecordHashInput => ({
  sourceCode: "mock",
  externalPlayerId: "1",
  playerName: "김탁구",
  normalizedPlayerName: normalizePlayerName("김탁구"),
  tournamentName: "가상대회",
  eventName: "단식",
  eventType: "singles",
  divisionValue,
  sourceUrl: "https://example.invalid/1",
  observedAt: "2026-08-12T00:00:00.000Z",
});

describe("crawler state", () => {
  it("deduplicates jobs and handles same/changed records", () => {
    const jobs = new RefreshJobDeduplicator();
    expect(jobs.enqueue("mock", "김탁구", 1)).toBe(true);
    expect(jobs.enqueue("mock", "김탁구", 1)).toBe(false);
    const repository = new InMemoryRecordRepository();
    expect(repository.upsertMany([withRecordHashes(record("5부"))])).toEqual({
      inserted: 1,
      updated: 0,
      unchanged: 0,
    });
    expect(repository.upsertMany([withRecordHashes(record("5부"))])).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 1,
    });
    expect(repository.upsertMany([withRecordHashes(record("4부"))])).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 0,
    });
    expect(repository.revisions[0]?.changedFields).toEqual(["divisionValue"]);
  });
  it("maps timeout and preserves disabled errors", () => {
    expect(mapSourceError(new DOMException("aborted", "AbortError")).code).toBe(
      "source_timeout",
    );
    expect(mapSourceError(new SourceDisabledError()).code).toBe(
      "source_disabled",
    );
  });

  it("presents records by event date, then source publication date", () => {
    const identity = {
      sourceCode: "mock" as const,
      externalPlayerId: "1",
      playerName: "김탁구",
      normalizedPlayerName: normalizePlayerName("김탁구"),
      eventName: "단식",
      eventType: "singles" as const,
      observedAt: "2026-08-12T00:00:00.000Z",
    };
    const records = [
      withRecordHashes({
        ...identity,
        tournamentName: "과거 대회",
        tournamentDate: "2025-01-01",
        sourceUrl: "https://example.invalid/old",
      }),
      withRecordHashes({
        ...identity,
        tournamentName: "최근 게시물",
        sourcePublishedDate: "2026-07-01",
        sourceUrl: "https://example.invalid/post",
      }),
      withRecordHashes({
        ...identity,
        tournamentName: "최근 대회",
        tournamentDate: "2026-08-01",
        sourcePublishedDate: "2026-08-02",
        sourceUrl: "https://example.invalid/new",
      }),
    ];

    const detail = recordsToPlayerDetails(records, "mock", "가상 출처")[0];
    expect(detail?.records.map(({ tournament }) => tournament)).toEqual([
      "최근 대회",
      "최근 게시물",
      "과거 대회",
    ]);
    expect(detail?.records[1]).toMatchObject({
      date: "2026-07-01",
      dateBasis: "published",
    });
    expect(detail?.records[0]).toMatchObject({
      date: "2026-08-01",
      dateBasis: "tournament",
    });
  });

  it("counts semifinal or better as awards and keeps lower rounds as participation", () => {
    const identity = {
      sourceCode: "mock" as const,
      externalPlayerId: "1",
      playerName: "김탁구",
      normalizedPlayerName: normalizePlayerName("김탁구"),
      eventName: "단식",
      eventType: "singles" as const,
      observedAt: "2026-08-12T00:00:00.000Z",
    };
    const records = [
      withRecordHashes({
        ...identity,
        tournamentName: "4강 대회",
        tournamentDate: "2026-08-01",
        rankText: "본선 4강",
        sourceUrl: "https://example.invalid/semifinal",
      }),
      withRecordHashes({
        ...identity,
        tournamentName: "8강 대회",
        tournamentDate: "2026-07-01",
        rankText: "본선 8강",
        sourceUrl: "https://example.invalid/quarterfinal",
      }),
    ];

    const detail = recordsToPlayerDetails(records, "mock", "가상 출처")[0];
    expect(detail?.resultCount).toBe(1);
    expect(detail?.awardResults).toEqual([
      {
        rank: "본선 4강",
        date: "2026-08-01",
        tournament: "4강 대회",
        event: "단식",
        lastCheckedAt: "2026-08-12T00:00:00.000Z",
      },
    ]);
    expect(detail?.sources[0]).toMatchObject({
      resultCount: 1,
      latestRank: "본선 4강",
    });
    expect(detail?.records).toHaveLength(2);
  });

  it("keeps non-individual records in history but excludes them from division estimates", () => {
    const identity = {
      sourceCode: "mock" as const,
      externalPlayerId: "1",
      playerName: "송승희",
      normalizedPlayerName: normalizePlayerName("송승희"),
      observedAt: "2026-08-12T00:00:00.000Z",
    };
    const records = [
      withRecordHashes({
        ...identity,
        tournamentName: "혼합복식 대회",
        tournamentDate: "2026-07-01",
        eventName: "혼합복식 B그룹(합 15~19부)",
        eventType: "doubles",
        divisionSystem: "integrated",
        divisionValue: "5부",
        rankText: "본선 8강",
        sourceUrl: "https://example.invalid/mixed-doubles",
      }),
      withRecordHashes({
        ...identity,
        tournamentName: "여자 개인단식 대회",
        tournamentDate: "2026-06-01",
        eventName: "여자 개인단식 6부",
        eventType: "singles",
        divisionSystem: "women",
        divisionValue: "6부",
        rankText: "본선 8강",
        sourceUrl: "https://example.invalid/women-singles",
      }),
    ];

    const detail = recordsToPlayerDetails(records, "mock", "가상 출처")[0];
    expect(detail?.records).toHaveLength(2);
    expect(detail).toMatchObject({
      recentObservedDivision: "6부",
      recentObservedDivisionSystem: "women",
      divisionObservations: [
        {
          system: "women",
          division: "6부",
          awardCount: 0,
          participationCount: 1,
        },
      ],
    });
  });

  it("keeps historical regional awards in detail records but omits them from recent summaries", () => {
    const identity = {
      sourceCode: "mock" as const,
      externalPlayerId: "1",
      playerName: "김탁구",
      normalizedPlayerName: normalizePlayerName("김탁구"),
      eventName: "개인단식",
      eventType: "singles" as const,
      observedAt: "2026-08-12T00:00:00.000Z",
    };
    const records = [
      withRecordHashes({
        ...identity,
        tournamentName: "2025년 제18회 분당구청장기 탁구대회",
        tournamentDate: "2025-05-01",
        tournamentRegion: "경기도 성남시",
        divisionSystem: "regional",
        divisionValue: "4부",
        rankText: "우승",
        sourceUrl: "https://example.invalid/bundang-18",
      }),
    ];

    const detail = recordsToPlayerDetails(records, "mock", "가상 출처")[0];
    expect(detail?.records).toHaveLength(1);
    expect(detail?.records[0]).toMatchObject({ rank: "우승", division: "4부" });
    expect(detail).toMatchObject({ resultCount: 0, awardResults: [] });
    expect(detail?.divisionObservations).toEqual([]);
    expect(detail?.sources[0]).toMatchObject({ resultCount: 0 });
    expect(detail?.sources[0]).not.toHaveProperty("latestRank");
    expect(detail?.sources[0]).not.toHaveProperty("latestRecordDate");
  });
});
