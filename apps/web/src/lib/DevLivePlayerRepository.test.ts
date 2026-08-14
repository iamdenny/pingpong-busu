import { afterEach, describe, expect, it, vi } from "vitest";
import { DevLivePlayerRepository } from "./DevLivePlayerRepository";

describe("DevLivePlayerRepository player search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps tournament event context returned by the live middleware", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "candidate-1",
              name: "송승희",
              normalizedName: "송승희",
              resultCount: 2,
              awardResults: [
                {
                  rank: "공동3위",
                  date: "2026-03-14",
                  tournament: "2026 경기도탁구협회장기 탁구대회",
                  event: "여자 4~6부",
                },
              ],
              latestParticipationDate: "2026-02-01",
              latestParticipationTournament: "혼합복식 생활체육대회",
              latestParticipationEvent: "혼합복식 B그룹(합 15~19부)",
              sourceCount: 1,
              lastCheckedAt: "2026-08-14T00:00:00.000Z",
              identityStatus: "unreviewed",
              dataKind: "live",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const repository = new DevLivePlayerRepository();

    await expect(
      repository.searchPlayers({ query: "송승희" }),
    ).resolves.toEqual([
      expect.objectContaining({
        awardResults: [
          expect.objectContaining({ event: "여자 4~6부" }),
        ],
        latestParticipationEvent: "혼합복식 B그룹(합 15~19부)",
      }),
    ]);
  });
});
