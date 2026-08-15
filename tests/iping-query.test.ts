import { describe, expect, it } from "vitest";
import { isSafeIpingPlayerName } from "../supabase/functions/_shared/iping-query";

describe("iPing queue player-name boundary", () => {
  it.each(["임대현", "김 탁구", "Jean-Pierre", "O'Connor", "박·탁구"])(
    "accepts a plausible player name: %s",
    (name) => expect(isSafeIpingPlayerName(name)).toBe(true),
  );

  it.each([
    "denny@example.com",
    "010-1234-5678",
    "1990-01-01",
    "서울특별시 중구 세종대로",
    "김탁구 101호",
    "홍길동 경기도 성남시 분당구",
    "홍길동 서울 강남 테헤란로",
    "A",
  ])("rejects sensitive or non-name input: %s", (name) =>
    expect(isSafeIpingPlayerName(name)).toBe(false),
  );
});
