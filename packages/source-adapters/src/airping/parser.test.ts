import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SourceSchemaChangedError } from "@busu/crawler-core";
import { parseAirpingSearchHtml } from "./parser";

const fixture = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../fixtures/sources/airping/search-result.html",
  ),
  "utf8",
);
const regionalOpenFixture = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../fixtures/sources/airping/regional-open-result.html",
  ),
  "utf8",
);
const bundangOverrideFixture = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../fixtures/sources/airping/bundang-division-overrides.html",
  ),
  "utf8",
);
const sourceEvidenceFixture = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../fixtures/sources/airping/source-evidence-boundary.html",
  ),
  "utf8",
);

describe("에어핑퐁 parser", () => {
  it("parses synthetic participation and award records without merging identities", () => {
    const records = parseAirpingSearchHtml(
      fixture,
      "홍라켓",
      "2026-08-12T00:00:00.000Z",
    );
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      sourceCode: "airping",
      playerName: "홍라켓",
      clubText: "합성드라이브",
      region: "경기도 용인시",
      tournamentDate: "2026-07-18",
      eventType: "singles",
      divisionValue: "6부",
      rankText: "본선 8강",
    });
    expect(records[1]).toMatchObject({
      eventType: "team",
      rankText: "공동3위",
    });
    expect(records[0]?.sourceUrl).not.toContain("PHPSESSID");
    expect(
      parseAirpingSearchHtml(fixture, "동명이인", "2026-08-12T00:00:00.000Z"),
    ).toEqual([]);
  });

  it("separates a schema change from an empty result", () => {
    expect(
      parseAirpingSearchHtml(
        '<form id="playerSearchForm"></form><ul class="_mc_content_list"><li>검색결과가 없습니다.</li></ul>',
        "홍라켓",
        "2026-08-12T00:00:00.000Z",
      ),
    ).toEqual([]);
    expect(() =>
      parseAirpingSearchHtml(
        "<html></html>",
        "홍라켓",
        "2026-08-12T00:00:00.000Z",
      ),
    ).toThrow(SourceSchemaChangedError);
  });

  it("classifies a pre-transition local event in an open tournament as regional", () => {
    const records = parseAirpingSearchHtml(
      regionalOpenFixture,
      "신상익",
      "2026-08-13T00:00:00.000Z",
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tournamentName: "제8회 수원시 홍재배 전국오픈 탁구대회",
      eventName: "지역혼성3/4부",
      divisionSystem: "regional",
      divisionValue: "3부",
    });
  });

  it("applies edition-bound custom tournament division overrides", () => {
    const records = parseAirpingSearchHtml(
      bundangOverrideFixture,
      "홍분당",
      "2026-08-13T00:00:00.000Z",
    );
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      tournamentName: "2023년 제16회 분당구청장기 탁구대회",
      divisionSystem: "regional",
      divisionValue: "3부",
    });
    expect(records[1]).toMatchObject({
      tournamentName: "제17회 분당구청장기 탁구대회",
      divisionSystem: "regional",
      divisionValue: "3부",
    });
    expect(records[2]).toMatchObject({
      tournamentName: "제18회 분당구청장기 탁구대회",
      divisionSystem: "regional",
      divisionValue: "3부",
    });
  });

  it("preserves suspicious-looking source affiliation and preliminary rank as raw evidence", () => {
    const records = parseAirpingSearchHtml(
      sourceEvidenceFixture,
      "홍근거",
      "2026-08-13T00:00:00.000Z",
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      playerName: "홍근거",
      clubText: "82개판5분전",
      rankText: "예선 12조 3위",
      tournamentName: "2026 출처 근거 경계 합성 대회",
    });
  });
});
