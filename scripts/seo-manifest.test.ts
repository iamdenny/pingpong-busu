import { describe, expect, it } from "vitest";
import { MAX_MANIFEST_AWARDS, parseManifest } from "./seo-manifest";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  canonical_name: "김탁구",
  homonym_nickname: null,
  primary_region: "서울",
  primary_club: null,
  result_count: 1,
  source_count: 1,
};

const award = {
  rank: "우승",
  date: "2026-05-03",
  tournament: "제5회 물결배",
  event: "개인전",
  division: "6부",
  division_system: "integrated",
};

describe("public SEO manifest parsing", () => {
  it("keeps the record snapshot when the extended view is deployed", () => {
    const [parsed] = parseManifest([
      {
        ...row,
        recent_observed_division: " 6부 ",
        recent_observed_division_system: "integrated",
        recent_awards: [award],
        source_names: ["아스트리 탁구", " "],
        last_checked_at: "2026-08-19T04:05:06+00:00",
      },
    ]);
    expect(parsed?.recent_observed_division).toBe("6부");
    expect(parsed?.recent_awards).toHaveLength(1);
    expect(parsed?.source_names).toEqual(["아스트리 탁구"]);
    expect(parsed?.last_checked_at).toBe("2026-08-19T04:05:06.000Z");
  });

  it("defaults the snapshot fields for an older payload", () => {
    const [parsed] = parseManifest([row]);
    expect(parsed?.recent_observed_division).toBeNull();
    expect(parsed?.recent_awards).toEqual([]);
    expect(parsed?.source_names).toEqual([]);
    expect(parsed?.last_checked_at).toBeNull();
  });

  it("rejects record values it cannot render safely", () => {
    expect(() =>
      parseManifest([{ ...row, recent_awards: [{ ...award, date: "어제" }] }]),
    ).toThrow(/date/u);
    expect(() =>
      parseManifest([
        { ...row, recent_awards: [{ ...award, division_system: "gold" }] },
      ]),
    ).toThrow(/division system/u);
    expect(() =>
      parseManifest([{ ...row, recent_awards: [{ ...award, rank: null }] }]),
    ).toThrow(/rank/u);
    expect(() =>
      parseManifest([{ ...row, last_checked_at: "언젠가" }]),
    ).toThrow(/last_checked_at/u);
    expect(() => parseManifest([{ ...row, source_names: "아스트리" }])).toThrow(
      /source_names/u,
    );
    expect(() =>
      parseManifest([{ ...row, primary_club: "가".repeat(201) }]),
    ).toThrow(/primary_club/u);
  });

  it("caps the award snapshot the view is allowed to return", () => {
    expect(() =>
      parseManifest([
        {
          ...row,
          recent_awards: Array.from(
            { length: MAX_MANIFEST_AWARDS + 1 },
            () => award,
          ),
        },
      ]),
    ).toThrow(/recent_awards/u);
  });
});
