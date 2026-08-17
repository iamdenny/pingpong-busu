import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import iconv from "iconv-lite";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixtureDirectory = resolve(
  import.meta.dirname,
  "../../../../fixtures/sources/iping",
);

function cp949Response(html: string, init: ResponseInit = {}): Response {
  return new Response(Uint8Array.from(iconv.encode(html, "cp949")), {
    ...init,
    headers: {
      "content-type": "text/html; charset=euc-kr",
      ...init.headers,
    },
  });
}

describe("IpingSourceAdapter authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps the response cookie and hidden form token separate, then follows cookie rotation", async () => {
    const loginHtml = readFileSync(
      resolve(fixtureDirectory, "login-form.html"),
      "utf8",
    );
    const entriesHtml = readFileSync(
      resolve(fixtureDirectory, "entries.html"),
      "utf8",
    );
    const awardsHtml = readFileSync(
      resolve(fixtureDirectory, "awards.html"),
      "utf8",
    );
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (init?.method === "POST") {
        return new Response(null, {
          status: 302,
          headers: {
            location: "/",
            "set-cookie":
              "PHPSESSID=cccccccccccccccccccccccccccccccc; Path=/; HttpOnly",
          },
        });
      }
      if (url.includes("pg=Search")) {
        return cp949Response(url.includes("&B=Y") ? entriesHtml : awardsHtml);
      }
      if (url.includes("pg=login")) {
        return cp949Response(loginHtml, {
          headers: {
            "set-cookie":
              "PHPSESSID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; Path=/; HttpOnly",
          },
        });
      }
      return cp949Response('<a href="/?pg=logout">로그아웃</a>');
    });
    vi.stubGlobal("fetch", fetchMock);
    const { IpingSourceAdapter } = await import("./adapter");
    const adapter = new IpingSourceAdapter(true, {
      username: "fixture-user",
      password: "fixture-password",
    });

    const result = await adapter.search(
      {
        name: "홍라켓",
        normalizedName: "홍라켓",
        maxPages: 1,
        live: true,
      },
      {
        now: () => new Date("2026-08-13T00:00:00.000Z"),
        timeoutMs: 12_000,
      },
    );

    const loginCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(loginCall?.[1]?.headers).toMatchObject({
      cookie: "PHPSESSID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      origin: "https://www.iping.club",
    });
    expect(loginCall?.[1]?.headers).toMatchObject({
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "user-agent": expect.stringMatching(/^Mozilla\/5\.0/u),
    });
    expect(loginCall?.[1]?.body).toContain(
      "PHPSESSID=0123456789abcdef0123456789abcdef",
    );
    const authenticatedGetCalls = fetchMock.mock.calls.filter(
      ([input, init]) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return init?.method !== "POST" && !url.includes("pg=login");
      },
    );
    expect(authenticatedGetCalls).toHaveLength(4);
    for (const [, init] of authenticatedGetCalls) {
      expect(init?.headers).toMatchObject({
        cookie: "PHPSESSID=cccccccccccccccccccccccccccccccc",
      });
    }
    expect(result.records).toHaveLength(3);
    expect(result.parserVersion).toBe("iping-5");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("rejects a login page without a hidden session token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      cp949Response('<form><input name="Mid"><input name="Pwd"></form>', {
        headers: {
          "set-cookie":
            "PHPSESSID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; Path=/; HttpOnly",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { IpingSourceAdapter } = await import("./adapter");
    const adapter = new IpingSourceAdapter(true, {
      username: "fixture-user",
      password: "fixture-password",
    });

    await expect(
      adapter.search(
        {
          name: "홍라켓",
          normalizedName: "홍라켓",
          maxPages: 1,
          live: true,
        },
        {
          now: () => new Date("2026-08-13T00:00:00.000Z"),
          timeoutMs: 12_000,
        },
      ),
    ).rejects.toThrow("아이핑 로그인 폼 토큰을 찾지 못했습니다.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
