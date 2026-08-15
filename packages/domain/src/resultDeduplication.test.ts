import { describe, expect, it } from "vitest";
import type { PlayerRecord } from "./models";
import {
  deduplicatePlayerRecords,
  resultDisplayFingerprint,
} from "./resultDeduplication";

function record(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: "airping-1",
    date: "2025-08-09",
    dateBasis: "tournament",
    tournament: "2025년 화성특례시 코리요 탁구대회",
    scale: "district",
    event: "남자 6~7부",
    eventType: "singles",
    club: "조경환탁구클럽",
    division: "6부",
    divisionSystem: "integrated",
    rank: "준우승",
    sourceCode: "airping",
    sourceName: "에어핑퐁",
    sourceUrl: "https://example.com/airping",
    lastCheckedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("cross-source result deduplication", () => {
  it("groups compatible source variants and preserves every URL", () => {
    const astree = record({
      id: "astree-1",
      event: "[남(혼)단식] 남자6~7부",
      sourceCode: "astree",
      sourceName: "애즈트리",
      sourceUrl: "https://example.com/astree",
      lastCheckedAt: "2026-08-16T00:00:00.000Z",
    });
    expect(resultDisplayFingerprint(record())).toBe(
      resultDisplayFingerprint(astree),
    );
    const grouped = deduplicatePlayerRecords([record(), astree]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.sources).toHaveLength(2);
    expect(grouped[0]?.sources?.map((source) => source.sourceUrl)).toEqual([
      "https://example.com/astree",
      "https://example.com/airping",
    ]);
  });

  it("keeps missing dates, same-source collisions, and factual differences separate", () => {
    const firstUndated = record({ id: "one" });
    delete firstUndated.date;
    delete firstUndated.dateBasis;
    const secondUndated = record({ id: "two" });
    delete secondUndated.date;
    delete secondUndated.dateBasis;
    expect(
      deduplicatePlayerRecords([firstUndated, secondUndated]),
    ).toHaveLength(2);
    expect(
      deduplicatePlayerRecords([record({ id: "one" }), record({ id: "two" })]),
    ).toHaveLength(2);
    expect(
      deduplicatePlayerRecords([
        record(),
        record({
          id: "astree-2",
          sourceCode: "astree",
          sourceName: "애즈트리",
          sourceUrl: "https://example.com/astree",
          rank: "우승",
        }),
      ]),
    ).toHaveLength(2);
  });

  it("preserves a meaningful gender token that only exists in the bracket prefix", () => {
    expect(
      deduplicatePlayerRecords([
        record({ event: "[남자단식] 통합6부" }),
        record({
          id: "astree-women",
          event: "[혼성단식] 통합6부",
          sourceCode: "astree",
          sourceName: "애즈트리",
          sourceUrl: "https://example.com/astree",
        }),
      ]),
    ).toHaveLength(2);
  });

  it("preserves the input chronology around grouped and ungrouped records", () => {
    const published = record({
      id: "published",
      date: "2025-08-08",
      dateBasis: "published",
    });
    const astree = record({
      id: "astree-ordered",
      sourceCode: "astree",
      sourceName: "애즈트리",
      sourceUrl: "https://example.com/astree",
    });
    expect(
      deduplicatePlayerRecords([published, record(), astree]).map(
        ({ id }) => id,
      ),
    ).toEqual(["published", expect.stringMatching(/^display-/u)]);
  });
});
