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

  it("forwards a hidden session id as both Cookie and login form data", async () => {
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
        return cp949Response('<a href="/?pg=logout">로그아웃</a>');
      }
      if (url.includes("pg=Search")) {
        return cp949Response(url.includes("&B=Y") ? entriesHtml : awardsHtml);
      }
      return cp949Response(loginHtml);
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
      cookie: "PHPSESSID=0123456789abcdef0123456789abcdef",
    });
    expect(loginCall?.[1]?.body).toContain(
      "PHPSESSID=0123456789abcdef0123456789abcdef",
    );
    expect(result.records).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
