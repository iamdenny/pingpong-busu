import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseYonginCafeSearchResponse } from "./parser";

const fixture = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../../fixtures/sources/yongintt/search-result.json",
    ),
    "utf8",
  ),
) as unknown;

describe("parseYonginCafeSearchResponse", () => {
  it("keeps only exact-name evidence from the Yongin cafe and normalizes public snippets", () => {
    const result = parseYonginCafeSearchResponse(
      fixture,
      "김라켓",
      "2026-08-12T00:00:00.000Z",
    );
    expect(result.isEnd).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      sourceCode: "yongintt",
      playerName: "김라켓",
      region: "경기도 용인시",
      tournamentName: "2026-07-20 용인시 탁구대회 입상 및 승급자",
      tournamentDate: "2026-07-20",
      sourcePublishedDate: "2026-07-25",
      eventName: "입상·승급 공지",
      divisionSystem: "women",
      divisionValue: "6부",
      rankText: "4강",
    });
    expect(result.records[1]).toMatchObject({
      sourcePublishedDate: "2025-11-04",
      eventName: "승급 공지",
    });
    expect(
      result.records.every((record) =>
        record.sourceUrl.startsWith("https://cafe.daum.net/yongintt/"),
      ),
    ).toBe(true);
    expect(
      result.records.every((record) => !record.sourceUrl.includes("/IWou/")),
    ).toBe(true);
  });

  it("does not attach another awardee's division and rank from a photo-board snippet", () => {
    const result = parseYonginCafeSearchResponse(
      fixture,
      "김라켓",
      "2026-08-12T00:00:00.000Z",
    );
    expect(result.records).not.toContainEqual(
      expect.objectContaining({
        sourceUrl: "https://cafe.daum.net/yongintt/IWou/11",
      }),
    );
  });

  it("does not attach fields from another name in a multi-player snippet", () => {
    const result = parseYonginCafeSearchResponse(
      fixture,
      "박오탐",
      "2026-08-12T00:00:00.000Z",
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceUrl: "https://cafe.daum.net/yongintt/IBLf/33",
      eventName: "입상 공지",
    });
    expect(result.records[0]?.divisionValue).toBeUndefined();
    expect(result.records[0]?.rankText).toBeUndefined();
  });

  it("does not treat a longer player name as an exact shorter-name match", () => {
    const response = {
      meta: { total_count: 1, pageable_count: 1, is_end: true },
      documents: [
        {
          title: "용인시 탁구대회 입상자",
          contents: "김미진 선수 6부 우승",
          url: "https://cafe.daum.net/yongintt/IBLf/44",
          cafename: "용인시탁구협회",
          thumbnail: "",
          datetime: "2026-08-13T00:00:00.000+09:00",
        },
      ],
    };
    expect(
      parseYonginCafeSearchResponse(
        response,
        "김미",
        "2026-08-13T00:00:00.000Z",
      ).records,
    ).toHaveLength(0);
  });

  it("does not use the post publication date as the tournament transition date", () => {
    const response = {
      meta: { total_count: 1, pageable_count: 1, is_end: true },
      documents: [
        {
          title: "용인시 탁구대회 입상자 안내",
          contents: "김라켓 선수 6부 우승",
          url: "https://cafe.daum.net/yongintt/IBLf/45",
          cafename: "용인시탁구협회",
          thumbnail: "",
          datetime: "2020-08-13T00:00:00.000+09:00",
        },
      ],
    };

    const result = parseYonginCafeSearchResponse(
      response,
      "김라켓",
      "2026-08-13T00:00:00.000Z",
    );

    expect(result.records[0]).toMatchObject({
      sourcePublishedDate: "2020-08-13",
      divisionSystem: "integrated",
    });
    expect(result.records[0]?.tournamentDate).toBeUndefined();
  });
});
