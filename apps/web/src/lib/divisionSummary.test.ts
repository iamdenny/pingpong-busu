import { describe, expect, it } from "vitest";
import type { DivisionSystem, PlayerSummary } from "@busu/domain";
import {
  groupDivisionSummaries,
  matchesObservedDivision,
  summarizeObservedDivisions,
  summarizeObservedDivisionsByIdentity,
} from "./divisionSummary";

function player(
  id: string,
  recentObservedDivision?: string,
  recentObservedDivisionSystem?: DivisionSystem,
  divisionObservations?: PlayerSummary["divisionObservations"],
  overrides: Partial<PlayerSummary> = {},
): PlayerSummary {
  return {
    id,
    name: "임대현",
    normalizedName: "임대현",
    ...(recentObservedDivision ? { recentObservedDivision } : {}),
    ...(recentObservedDivisionSystem ? { recentObservedDivisionSystem } : {}),
    ...(divisionObservations ? { divisionObservations } : {}),
    resultCount: 1,
    sourceCount: 1,
    lastCheckedAt: "2026-08-12T00:00:00.000Z",
    identityStatus: "unreviewed",
    ...overrides,
  };
}

describe("summarizeObservedDivisions", () => {
  it("keeps equal division values separate across division systems", () => {
    expect(
      summarizeObservedDivisions([
        player("1", "6부", "open"),
        player("2", "6부", "integrated"),
        player("3", "6부", "open"),
        player("4"),
        player("5", "4부", "women"),
        player("6", "T5", "division"),
      ]),
    ).toEqual([
      {
        system: "open",
        systemLabel: "오픈부수",
        division: "6부",
        awardCount: 2,
        participationCount: 0,
      },
      {
        system: "integrated",
        systemLabel: "통합부수",
        division: "6부",
        awardCount: 1,
        participationCount: 0,
      },
      {
        system: "women",
        systemLabel: "통합부수",
        division: "여자4부",
        awardCount: 1,
        participationCount: 0,
      },
      {
        system: "division",
        systemLabel: "디비전부수",
        division: "T5",
        awardCount: 1,
        participationCount: 0,
      },
      {
        system: "unknown",
        systemLabel: "체계 확인 필요",
        division: "확인 필요",
        awardCount: 1,
        participationCount: 0,
      },
    ]);
  });

  it("adds record-level award and participation counts across candidates", () => {
    expect(
      summarizeObservedDivisions([
        player("1", undefined, undefined, [
          {
            system: "open",
            division: "6부",
            awardCount: 2,
            participationCount: 3,
          },
          {
            system: "regional",
            division: "5부",
            awardCount: 0,
            participationCount: 1,
          },
        ]),
        player("2", undefined, undefined, [
          {
            system: "open",
            division: "6부",
            awardCount: 1,
            participationCount: 4,
          },
          {
            system: "division",
            division: "T4",
            awardCount: 1,
            participationCount: 0,
          },
        ]),
      ]),
    ).toEqual([
      {
        system: "open",
        systemLabel: "오픈부수",
        division: "6부",
        awardCount: 3,
        participationCount: 7,
      },
      {
        system: "regional",
        systemLabel: "지역부수",
        division: "5부",
        awardCount: 0,
        participationCount: 1,
      },
      {
        system: "division",
        systemLabel: "디비전부수",
        division: "T4",
        awardCount: 1,
        participationCount: 0,
      },
    ]);
  });

  it("groups observations into one row per displayed division system", () => {
    const summaries = summarizeObservedDivisions([
      player("1", "6부", "open"),
      player("2", "5부", "integrated"),
      player("3", "4부", "women"),
      player("4", "3부", "regional"),
      player("5", "T5", "division"),
    ]);

    const groups = groupDivisionSummaries(summaries);

    expect(
      groups.map(({ system, systemLabel }) => ({ system, systemLabel })),
    ).toEqual([
      { system: "open", systemLabel: "오픈부수" },
      { system: "integrated", systemLabel: "통합부수" },
      { system: "regional", systemLabel: "지역부수" },
      { system: "division", systemLabel: "디비전부수" },
    ]);
    expect(
      groups[1]?.rows.map(({ kind, label, items }) => ({
        kind,
        label,
        divisions: items.map(({ division }) => division),
      })),
    ).toEqual([
      { kind: "general", label: "일반부수", divisions: ["5부"] },
      { kind: "women", label: "여자부수", divisions: ["여자4부"] },
    ]);
  });

  it("orders player and numbered divisions from the strongest level upward", () => {
    const summaries = summarizeObservedDivisions([
      player("1", "7부", "open"),
      player("2", "선수부", "open"),
      player("3", "2부", "open"),
      player("4", "0부", "open"),
      player("5", "1부", "open"),
      player("6", "신입생", "open"),
      player("7", "T5", "division"),
      player("8", "T2", "division"),
    ]);

    const groups = groupDivisionSummaries(summaries);

    expect(groups[0]?.rows[0]?.items.map(({ division }) => division)).toEqual([
      "선수부",
      "0부",
      "1부",
      "2부",
      "7부",
      "신입생",
    ]);
    expect(groups[1]?.rows[0]?.items.map(({ division }) => division)).toEqual([
      "T2",
      "T5",
    ]);
  });

  it("matches a summary item by both division system and displayed division", () => {
    const openSix = player("1", "6부", "open");
    const integratedSix = player("2", "6부", "integrated");
    const womenSix = player("3", "6부", "women");

    expect(
      matchesObservedDivision(openSix, { system: "open", division: "6부" }),
    ).toBe(true);
    expect(
      matchesObservedDivision(integratedSix, {
        system: "open",
        division: "6부",
      }),
    ).toBe(false);
    expect(
      matchesObservedDivision(womenSix, {
        system: "women",
        division: "여자6부",
      }),
    ).toBe(true);
  });

  it("separates verified nickname summaries from unassigned records", () => {
    const sections = summarizeObservedDivisionsByIdentity([
      player("denny-open", "6부", "open", undefined, {
        identityStatus: "verified",
        homonymNickname: "데니",
      }),
      player("denny-integrated", "6부", "integrated", undefined, {
        identityStatus: "verified",
        homonymNickname: "데니",
      }),
      player("chiquita", "4부", "women", undefined, {
        identityStatus: "verified",
        homonymNickname: "치키타 장인",
      }),
      player("unassigned", "5부", "open"),
      player("unreviewed-nickname", "7부", "open", undefined, {
        homonymNickname: "아직 검토 전",
      }),
    ]);

    expect(
      sections.map(({ key, label, isAssigned, players }) => ({
        key,
        label,
        isAssigned,
        playerIds: players.map(({ id }) => id),
      })),
    ).toEqual([
      {
        key: 'nickname:["임대현","데니"]',
        label: "데니",
        isAssigned: true,
        playerIds: ["denny-open", "denny-integrated"],
      },
      {
        key: 'nickname:["임대현","치키타 장인"]',
        label: "치키타 장인",
        isAssigned: true,
        playerIds: ["chiquita"],
      },
      {
        key: "unassigned",
        label: "미분류 기록",
        isAssigned: false,
        playerIds: ["unassigned", "unreviewed-nickname"],
      },
    ]);
    expect(
      sections[0]?.summaries.map(({ system, division }) => ({
        system,
        division,
      })),
    ).toEqual([
      { system: "open", division: "6부" },
      { system: "integrated", division: "6부" },
    ]);
    expect(sections[2]?.summaries.map(({ division }) => division)).toEqual([
      "5부",
      "7부",
    ]);
  });

  it("keeps the existing single summary when no verified nickname exists", () => {
    const sections = summarizeObservedDivisionsByIdentity([
      player("one", "6부", "open"),
      player("two", "5부", "integrated", undefined, {
        homonymNickname: "표시만 있는 별칭",
      }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      key: "all",
      label: "전체 기록",
      isAssigned: false,
    });
    expect(sections[0]?.players.map(({ id }) => id)).toEqual(["one", "two"]);
  });

  it("keeps the fallback summary across names when no nickname is verified", () => {
    const sections = summarizeObservedDivisionsByIdentity([
      player("lim", "6부", "open"),
      player("kim", "5부", "integrated", undefined, {
        name: "김대현",
        normalizedName: "김대현",
      }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      key: "all",
      label: "전체 기록",
      isAssigned: false,
    });
    expect(sections[0]?.players.map(({ id }) => id)).toEqual(["lim", "kim"]);
  });

  it("keeps a single verified player in the existing ungrouped summary", () => {
    const sections = summarizeObservedDivisionsByIdentity([
      player("only", "6부", "integrated", undefined, {
        identityStatus: "verified",
        homonymNickname: "데니",
      }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      key: "all",
      label: "전체 기록",
      isAssigned: false,
    });
    expect(sections[0]?.players.map(({ id }) => id)).toEqual(["only"]);
  });

  it("never combines the same nickname across different player names", () => {
    const sections = summarizeObservedDivisionsByIdentity([
      player("lim-denny", "6부", "integrated", undefined, {
        identityStatus: "verified",
        homonymNickname: "데니",
      }),
      player("kim-denny", "4부", "open", undefined, {
        name: "김대현",
        normalizedName: "김대현",
        identityStatus: "verified",
        homonymNickname: "데니",
      }),
      player("lim-unassigned", "5부", "regional"),
      player("kim-unassigned", "T4", "division", undefined, {
        name: "김대현",
        normalizedName: "김대현",
      }),
    ]);

    expect(
      sections.map(({ label, players }) => ({
        label,
        playerIds: players.map(({ id }) => id),
      })),
    ).toEqual([
      { label: "김대현 · 데니", playerIds: ["kim-denny"] },
      { label: "임대현 · 데니", playerIds: ["lim-denny"] },
      {
        label: "임대현 · 미분류 기록",
        playerIds: ["lim-unassigned"],
      },
      {
        label: "김대현 · 미분류 기록",
        playerIds: ["kim-unassigned"],
      },
    ]);
  });
});
