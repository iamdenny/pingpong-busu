import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyIpingSessionHtml } from "./session";

const fixtureDirectory = resolve(
  import.meta.dirname,
  "../../../../fixtures/sources/iping",
);

describe("classifyIpingSessionHtml", () => {
  it("recognizes the current login form as a guest session", () => {
    const html = readFileSync(
      resolve(fixtureDirectory, "login-form.html"),
      "utf8",
    );
    expect(classifyIpingSessionHtml(html)).toBe("guest");
  });

  it("accepts both current and legacy logout links", () => {
    expect(classifyIpingSessionHtml('<a href="/?pg=logout">로그아웃</a>')).toBe(
      "authenticated",
    );
    expect(classifyIpingSessionHtml('<a href="mb_logout.php">out</a>')).toBe(
      "authenticated",
    );
  });

  it("separates a challenge from an unknown response", () => {
    expect(classifyIpingSessionHtml("자동등록방지")).toBe("challenge");
    expect(classifyIpingSessionHtml("<html>maintenance</html>")).toBe(
      "unknown",
    );
  });
});
