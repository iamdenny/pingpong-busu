import { describe, expect, it } from "vitest";

import { excludedAwardScope, isMixedGenderEvent } from "./awardScope";

describe("excludedAwardScope", () => {
  it("keeps individual records out of the excluded scope", () => {
    expect(
      excludedAwardScope({ event: "[여자단식] 여자 4~6부" }),
    ).toBeUndefined();
    expect(
      excludedAwardScope({ event: "오픈개인 [5~8/]부", eventType: "singles" }),
    ).toBeUndefined();
    expect(excludedAwardScope({})).toBeUndefined();
  });

  it("labels the excluded record by its event scope", () => {
    expect(excludedAwardScope({ event: "[여자단체] 여자 4~6부" })).toBe("team");
    expect(
      excludedAwardScope({ event: "[여자복식] 토 오픈여자(합10부~ 이상)" }),
    ).toBe("doubles");
    expect(excludedAwardScope({ event: "혼성B그룹" })).toBe("mixed");
    expect(excludedAwardScope({ event: "일 혼합복식" })).toBe("doubles");
  });

  it("uses the event type when the name has no scope word", () => {
    expect(excludedAwardScope({ event: "오픈 4~6부", eventType: "team" })).toBe(
      "team",
    );
    expect(
      excludedAwardScope({ event: "오픈 4~6부", eventType: "doubles" }),
    ).toBe("doubles");
  });
});

describe("isMixedGenderEvent", () => {
  it("flags events that rate players on the mixed scale", () => {
    expect(isMixedGenderEvent("[혼합복식] B그룹(합 15~19부)")).toBe(true);
    expect(isMixedGenderEvent("B그룹(혼성6~8부)")).toBe(true);
    expect(isMixedGenderEvent("[남(혼)단식] 수원통합 7~10부 A")).toBe(true);
  });

  it("leaves single-gender events alone", () => {
    expect(isMixedGenderEvent("[여자단식] 여자 3~6부")).toBe(false);
    expect(isMixedGenderEvent("[여자복식] 여자1~6부")).toBe(false);
    expect(isMixedGenderEvent("오픈개인 [5~8/]부")).toBe(false);
    expect(isMixedGenderEvent(undefined)).toBe(false);
  });
});
