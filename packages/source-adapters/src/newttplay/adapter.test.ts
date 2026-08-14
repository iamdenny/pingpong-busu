import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SourceDisabledError,
  SourceRateLimitedError,
  SourceSchemaChangedError,
} from "@busu/crawler-core";
import { NewttplaySourceAdapter } from "./adapter";

const fixture = (name: string): string =>
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../../fixtures/sources/newttplay",
      name,
    ),
    "utf8",
  );

const input = {
  name: "김탁구",
  normalizedName: "김탁구",
  maxPages: 5,
  live: true,
};
const context = {
  now: () => new Date("2026-08-14T00:00:00.000Z"),
  timeoutMs: 1_000,
  userAgent: "BUSU/test",
};

afterEach(() => vi.unstubAllGlobals());

describe("NewTTPlay adapter", () => {
  it("requires explicit enablement", async () => {
    await expect(
      new NewttplaySourceAdapter().search(input, context),
    ).rejects.toBeInstanceOf(SourceDisabledError);
  });

  it("uses bounded GET pagination and deduplicates repeated event anchors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(fixture("search-result.html"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(fixture("empty-result.html"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new NewttplaySourceAdapter(true).search(
      input,
      context,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.records).toHaveLength(3);
    const firstUrl = fetchMock.mock.calls[0]?.[0];
    expect(firstUrl).toBeInstanceOf(URL);
    if (!(firstUrl instanceof URL)) throw new Error("expected URL request");
    expect(firstUrl.searchParams.get("bo_table")).toBe("member_search");
    expect(firstUrl.searchParams.get("sfl")).toBe("wr_subject");
    expect(firstUrl.searchParams.get("stx")).toBe("김탁구");
    expect(firstUrl.searchParams.get("page")).toBe("1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: "follow",
      headers: { accept: "text/html", "user-agent": "BUSU/test" },
    });
  });

  it("maps rate limits and rejects non-HTML responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("", { status: 429 })),
    );
    await expect(
      new NewttplaySourceAdapter(true).search(input, context),
    ).rejects.toBeInstanceOf(SourceRateLimitedError);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      new NewttplaySourceAdapter(true).search(input, context),
    ).rejects.toBeInstanceOf(SourceSchemaChangedError);
  });
});
