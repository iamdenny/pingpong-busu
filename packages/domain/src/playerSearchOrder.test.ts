import { describe, expect, it } from "vitest";
import type { PlayerSummary } from "./models";
import { sortPlayerSearchResults } from "./playerSearchOrder";

function player(
  id: string,
  overrides: Partial<PlayerSummary> = {},
): PlayerSummary {
  return {
    id,
    name: "임대현",
    normalizedName: "임대현",
    resultCount: 0,
    sourceCount: 1,
    lastCheckedAt: "2026-08-01T00:00:00.000Z",
    identityStatus: "unreviewed",
    ...overrides,
  };
}

describe("sortPlayerSearchResults", () => {
  it("puts community-selected identities before awards and participations", () => {
    const sorted = sortPlayerSearchResults([
      player("recent-entry", { latestParticipationDate: "2026-08-13" }),
      player("recent-award", {
        resultCount: 1,
        awardResults: [{ rank: "우승", date: "2026-08-12" }],
      }),
      player("selected", {
        identityStatus: "verified",
        latestParticipationDate: "2024-01-01",
      }),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual([
      "selected",
      "recent-award",
      "recent-entry",
    ]);
  });

  it("sorts awards by award date and entries by latest record date", () => {
    const candidates = [
      player("older-entry", { latestParticipationDate: "2025-01-02" }),
      player("older-award", {
        resultCount: 1,
        awardResults: [{ rank: "우승", date: "2025-05-02" }],
      }),
      player("newer-entry", { latestParticipationDate: "2026-02-03" }),
      player("newer-award", {
        resultCount: 1,
        awardResults: [
          { rank: "3위", date: "2025-03-01" },
          { rank: "준우승", date: "2026-03-01" },
        ],
      }),
    ];

    expect(
      sortPlayerSearchResults(candidates, "all").map(({ id }) => id),
    ).toEqual(["newer-award", "older-award", "newer-entry", "older-entry"]);
    expect(
      sortPlayerSearchResults(
        candidates.filter(({ resultCount }) => resultCount > 0),
        "awards",
      ).map(({ id }) => id),
    ).toEqual(["newer-award", "older-award"]);
    expect(
      sortPlayerSearchResults(
        candidates.filter(({ resultCount }) => resultCount === 0),
        "entries",
      ).map(({ id }) => id),
    ).toEqual(["newer-entry", "older-entry"]);
  });

  it("uses the selected tab date even when a player has both record types", () => {
    const recentAward = player("recent-award", {
      resultCount: 1,
      awardResults: [{ rank: "우승", date: "2026-08-10" }],
      latestParticipationDate: "2026-01-01",
    });
    const recentEntry = player("recent-entry", {
      resultCount: 1,
      awardResults: [{ rank: "우승", date: "2025-01-01" }],
      latestParticipationDate: "2026-08-11",
    });

    expect(
      sortPlayerSearchResults([recentEntry, recentAward], "awards").map(
        ({ id }) => id,
      ),
    ).toEqual(["recent-award", "recent-entry"]);
    expect(
      sortPlayerSearchResults([recentAward, recentEntry], "entries").map(
        ({ id }) => id,
      ),
    ).toEqual(["recent-entry", "recent-award"]);
  });

  it("uses activity-specific confirmation times when records have no dates", () => {
    const recentUndatedAward = player("recent-undated-award", {
      resultCount: 1,
      lastCheckedAt: "2026-08-14T00:00:00.000Z",
      awardResults: [
        { rank: "우승", lastCheckedAt: "2026-08-13T00:00:00.000Z" },
      ],
      latestParticipationCheckedAt: "2026-01-01T00:00:00.000Z",
    });
    const recentUnrelatedEntry = player("recent-unrelated-entry", {
      resultCount: 1,
      lastCheckedAt: "2026-08-15T00:00:00.000Z",
      awardResults: [
        { rank: "준우승", lastCheckedAt: "2026-02-01T00:00:00.000Z" },
      ],
      latestParticipationCheckedAt: "2026-08-15T00:00:00.000Z",
    });

    expect(
      sortPlayerSearchResults(
        [recentUnrelatedEntry, recentUndatedAward],
        "awards",
      ).map(({ id }) => id),
    ).toEqual(["recent-undated-award", "recent-unrelated-entry"]);
    expect(
      sortPlayerSearchResults(
        [recentUndatedAward, recentUnrelatedEntry],
        "entries",
      ).map(({ id }) => id),
    ).toEqual(["recent-unrelated-entry", "recent-undated-award"]);
  });

  it("prefers dated awards over confirmation times from undated awards", () => {
    const olderDatedAward = player("older-dated-award", {
      resultCount: 2,
      awardResults: [
        { rank: "우승", date: "2025-12-01" },
        { rank: "준우승", lastCheckedAt: "2026-08-14T00:00:00.000Z" },
      ],
    });
    const newerDatedAward = player("newer-dated-award", {
      resultCount: 1,
      awardResults: [{ rank: "3위", date: "2026-01-01" }],
    });

    expect(
      sortPlayerSearchResults(
        [olderDatedAward, newerDatedAward],
        "awards",
      ).map(({ id }) => id),
    ).toEqual(["newer-dated-award", "older-dated-award"]);
  });
});
