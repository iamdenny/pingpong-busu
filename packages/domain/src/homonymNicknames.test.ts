import { describe, expect, it } from "vitest";
import {
  homonymNicknameCatalog,
  homonymNicknameLabel,
  isHomonymNicknameCode,
} from "./homonymNicknames";

describe("homonym nicknames", () => {
  it("provides curated memorable table-tennis nicknames", () => {
    expect(homonymNicknameLabel("power-drive")).toBe("파워 드라이브");
    expect(homonymNicknameLabel("loop-drive-champion")).toBe(
      "루프 드라이브 최강자",
    );
    expect(homonymNicknameLabel("back-drive-master")).toBe("백드라이브 마스터");
    expect(homonymNicknameLabel("amateur-best")).toBe("아마추어 최강");
    expect(homonymNicknameLabel("edge-fairy")).toBe("엣지의 요정");
    expect(homonymNicknameLabel("spin-restaurant")).toBe("회전 맛집");
  });

  it("accepts catalog codes and rejects arbitrary public labels", () => {
    expect(homonymNicknameCatalog.length).toBeGreaterThanOrEqual(20);
    expect(isHomonymNicknameCode("chiquita-artisan")).toBe(true);
    expect(isHomonymNicknameCode("사용자 자유 입력")).toBe(false);
  });
});
