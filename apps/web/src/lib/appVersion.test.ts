import { describe, expect, it } from "vitest";
import { displayAppVersion } from "./appVersion";

describe("displayAppVersion", () => {
  it("accepts the deployment calendar version", () => {
    expect(displayAppVersion("2026.33.4")).toBe("2026.33.4");
  });

  it("labels missing or invalid build metadata as development", () => {
    expect(displayAppVersion(undefined)).toBe("개발");
    expect(displayAppVersion("0.1.0")).toBe("개발");
  });
});
