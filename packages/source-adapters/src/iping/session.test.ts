import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyIpingSessionHtml,
  extractIpingSessionCookie,
  extractIpingSessionCookieFromHeader,
  extractIpingSessionCookieFromHeaders,
  extractIpingSessionId,
  extractIpingSessionIdFromCookie,
} from "./session";

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

describe("extractIpingSessionCookie", () => {
  it("uses the current login form session id when Set-Cookie is unavailable", () => {
    const html = readFileSync(
      resolve(fixtureDirectory, "login-form.html"),
      "utf8",
    );
    expect(extractIpingSessionCookie(html)).toBe(
      "PHPSESSID=0123456789abcdef0123456789abcdef",
    );
    expect(extractIpingSessionId(html)).toBe(
      "0123456789abcdef0123456789abcdef",
    );
    expect(
      extractIpingSessionIdFromCookie(
        "PHPSESSID=0123456789abcdef0123456789abcdef",
      ),
    ).toBe("0123456789abcdef0123456789abcdef");
  });

  it("rejects malformed session ids", () => {
    expect(
      extractIpingSessionCookie(
        '<input name="PHPSESSID" value="invalid; session">',
      ),
    ).toBeUndefined();
    expect(
      extractIpingSessionIdFromCookie("PHPSESSID=invalid; session"),
    ).toBeUndefined();
  });

  it("accepts whitespace, reversed, and unquoted login form attributes", () => {
    expect(
      extractIpingSessionId(
        '<input value=0123456789abcdef0123456789abcdef name = "PHPSESSID">',
      ),
    ).toBe("0123456789abcdef0123456789abcdef");
  });

  it("selects PHPSESSID from a combined Set-Cookie header", () => {
    expect(
      extractIpingSessionCookieFromHeader(
        "locale=ko; Path=/, PHPSESSID=0123456789abcdef0123456789abcdef; Path=/; HttpOnly",
      ),
    ).toBe("PHPSESSID=0123456789abcdef0123456789abcdef");
    expect(
      extractIpingSessionCookieFromHeader("locale=ko; Path=/"),
    ).toBeUndefined();
  });

  it("uses the server-side Set-Cookie array before the combined header", () => {
    expect(
      extractIpingSessionCookieFromHeaders({
        get: () => null,
        getSetCookie: () => [
          "locale=ko; Path=/",
          "PHPSESSID=0123456789abcdef0123456789abcdef; Path=/; HttpOnly",
        ],
      }),
    ).toBe("PHPSESSID=0123456789abcdef0123456789abcdef");
  });
});
