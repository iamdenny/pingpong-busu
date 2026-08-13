import { describe, expect, it } from "vitest";
import {
  homonymNicknameSuggestions,
  homonymNicknameLabel,
  isHomonymNickname,
  normalizeHomonymNickname,
  pickHomonymNicknameSuggestion,
} from "./homonymNicknames";

describe("homonym nicknames", () => {
  it("provides editable initial nickname suggestions", () => {
    expect(homonymNicknameSuggestions).toHaveLength(30);
    expect(new Set(homonymNicknameSuggestions).size).toBe(30);
    expect(homonymNicknameSuggestions.every(isHomonymNickname)).toBe(true);
    expect(homonymNicknameSuggestions).toContain("파워 드라이브 전문가");
    expect(homonymNicknameSuggestions).toContain("치키타 장인");
    expect(pickHomonymNicknameSuggestion([], 0)).toBe("파워 드라이브 전문가");
    expect(pickHomonymNicknameSuggestion(["파워 드라이브 전문가"], 0)).toBe(
      "루프 드라이브 최강자",
    );
    expect(homonymNicknameLabel("power-drive")).toBe("파워 드라이브 전문가");
  });

  it("accepts normalized user-entered aliases without a catalog", () => {
    expect(normalizeHomonymNickname("  치키타   요정  ")).toBe("치키타 요정");
    expect(isHomonymNickname("치키타 요정")).toBe(true);
    expect(isHomonymNickname("Denny-드라이브")).toBe(true);
    expect(isHomonymNickname("5030")).toBe(false);
    expect(isHomonymNickname("<script>")).toBe(false);
    expect(isHomonymNickname("가".repeat(21))).toBe(false);
  });
});
