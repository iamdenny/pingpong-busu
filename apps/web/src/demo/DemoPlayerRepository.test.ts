import { afterEach, describe, expect, it } from "vitest";
import { DemoPlayerRepository } from "./DemoPlayerRepository";
import { demoPlayers } from "./data";

describe("DemoPlayerRepository player search", () => {
  const originalRegion = demoPlayers[0]?.region;

  afterEach(() => {
    const player = demoPlayers[0];
    if (!player) return;
    if (originalRegion) player.region = originalRegion;
    else delete player.region;
  });

  it("matches a child district for its parent municipality", async () => {
    const player = demoPlayers[0];
    if (!player) throw new Error("합성 demo 선수가 필요합니다.");
    player.region = "분당구";

    const repository = new DemoPlayerRepository();

    await expect(
      repository.searchPlayers({ query: player.name, region: "성남" }),
    ).resolves.toEqual([
      expect.objectContaining({ id: player.id, region: "분당구" }),
    ]);
  });
});
