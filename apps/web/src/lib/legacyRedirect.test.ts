import { describe, expect, it, vi } from "vitest";
import {
  legacyRedirectDestination,
  redirectLegacyHost,
} from "../../public/legacy-redirect.js";

type LegacyLocation = {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
};

function location(overrides: Partial<LegacyLocation> = {}): LegacyLocation {
  return {
    hostname: "busu.iamdenny.com",
    pathname: "/",
    search: "",
    hash: "",
    ...overrides,
  };
}

describe("legacy BUSU redirect", () => {
  it("keeps canonical product paths and query strings", () => {
    expect(
      legacyRedirectDestination(
        location({ pathname: "/search", search: "?q=%EA%B9%80%ED%83%81%EA%B5%AC" }),
      ),
    ).toBe("https://modutt.kr/busu/search/?q=%EA%B9%80%ED%83%81%EA%B5%AC");
    expect(
      legacyRedirectDestination(location({ pathname: "/players/kim-seoul" })),
    ).toBe("https://modutt.kr/busu/players/kim-seoul/");
    expect(
      legacyRedirectDestination(location({ pathname: "/directory/%E3%84%B1/2" })),
    ).toBe("https://modutt.kr/busu/directory/%E3%84%B1/2/");
  });

  it("does not duplicate the product namespace or move root documents", () => {
    expect(
      legacyRedirectDestination(location({ pathname: "/busu/players/kim-seoul/" })),
    ).toBe("https://modutt.kr/busu/players/kim-seoul/");
    expect(
      legacyRedirectDestination(location({ pathname: "/sitemap.xml" })),
    ).toBe("https://modutt.kr/sitemap.xml");
  });

  it("migrates historical hash routes and ignores every other host", () => {
    expect(
      legacyRedirectDestination(
        location({ pathname: "/", hash: "#/search?q=%EA%B9%80%ED%83%81%EA%B5%AC" }),
      ),
    ).toBe("https://modutt.kr/busu/search/?q=%EA%B9%80%ED%83%81%EA%B5%AC");
    expect(
      legacyRedirectDestination(location({ hostname: "localhost", pathname: "/search" })),
    ).toBeUndefined();
  });

  it("uses replace so the legacy page is not left in browser history", () => {
    const replace = vi.fn();
    expect(redirectLegacyHost(location(), replace)).toBe(true);
    expect(replace).toHaveBeenCalledWith("https://modutt.kr/busu/");
    expect(redirectLegacyHost(location({ hostname: "localhost" }), replace)).toBe(
      false,
    );
  });
});
