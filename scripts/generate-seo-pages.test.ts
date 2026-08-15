import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  fetchPublicPlayerManifest,
  generateSeoPages,
  generateSeoPagesFromEnvironment,
  renderSeoHtml,
  renderSitemap,
  type SeoPlayer,
} from "./generate-seo-pages";

const id = "11111111-1111-4111-8111-111111111111";
const player: SeoPlayer = {
  id,
  canonical_name: '김<&"탁구',
  homonym_nickname: "서울 드라이브",
  primary_region: "서울",
  primary_club: null,
  result_count: 2,
  source_count: 1,
};
const template =
  '<!doctype html><html><head><title>old</title><meta name="description" content="old" /></head><body><div id="root"></div></body></html>';

describe("SEO page generation", () => {
  it("escapes player-controlled HTML and emits unique route metadata", async () => {
    const directory = join(tmpdir(), `busu-seo-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), template);
    await generateSeoPages({ outputDirectory: directory, players: [player] });
    const html = await readFile(
      join(directory, "players", id, "index.html"),
      "utf8",
    );
    expect(html).toContain("김&lt;&amp;&quot;탁구");
    expect(html.match(/rel="canonical"/gu)).toHaveLength(1);
    expect(html).toContain(`https://busu.iamdenny.com/players/${id}/`);
    expect(html).toContain('property="og:type" content="profile"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain("서울 드라이브 선수 탁구 부수·입상 기록");
    expect(
      await readFile(join(directory, "search", "index.html"), "utf8"),
    ).toContain('name="robots" content="noindex,follow"');
  });

  it("uses the same display label for legacy nickname tokens", async () => {
    const directory = join(tmpdir(), `busu-seo-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), template);
    await generateSeoPages({
      outputDirectory: directory,
      players: [{ ...player, homonym_nickname: "power-drive" }],
    });
    const html = await readFile(
      join(directory, "players", id, "index.html"),
      "utf8",
    );
    expect(html).toContain("파워 드라이브 전문가 선수 탁구 부수·입상 기록");
    expect(html).not.toContain("power-drive 선수 탁구 부수·입상 기록");
  });

  it("includes only home and eligible players in deterministic sitemap", () => {
    const xml = renderSitemap([player]);
    expect(xml).toContain("https://busu.iamdenny.com/</loc>");
    expect(xml).toContain(`/players/${id}/</loc>`);
    expect(xml).not.toContain("/search");
  });

  it("paginates and rejects invalid public rows", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([player])))
      .mockResolvedValueOnce(new Response(JSON.stringify([])));
    await expect(
      fetchPublicPlayerManifest({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetch: fetcher,
        pageSize: 1,
      }),
    ).resolves.toEqual([player]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(`id=gt.${id}`);
    const invalidFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([{ ...player, id: "../bad" }])),
      );
    await expect(
      fetchPublicPlayerManifest({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetch: invalidFetch,
      }),
    ).rejects.toThrow();
  });

  it("aborts stalled requests and rejects runaway pagination", async () => {
    const stalledFetch = vi.fn(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    await expect(
      fetchPublicPlayerManifest({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetch: stalledFetch,
        requestTimeoutMs: 1,
        maxDurationMs: 10,
      }),
    ).rejects.toThrow(/aborted/u);

    const repeatedFullPage = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify([player])));
    await expect(
      fetchPublicPlayerManifest({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetch: repeatedFullPage,
        pageSize: 1,
        maxPages: 2,
      }),
    ).rejects.toThrow(/pagination|page budget/u);
  });

  it("fails closed when production configuration or manifest is absent", async () => {
    await expect(
      generateSeoPagesFromEnvironment("unused", {
        SEO_MANIFEST_REQUIRED: "true",
      }),
    ).rejects.toThrow(/required/u);

    const directory = join(tmpdir(), `busu-seo-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), template);
    const emptyFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([])));
    await expect(
      generateSeoPagesFromEnvironment(
        directory,
        {
          SEO_MANIFEST_REQUIRED: "true",
          VITE_SUPABASE_URL: "https://example.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY: "public",
        },
        emptyFetch,
      ),
    ).rejects.toThrow(/empty/u);

    const failedFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      fetchPublicPlayerManifest({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetch: failedFetch,
      }),
    ).rejects.toThrow(/500/u);
  });

  it("does not leave stale player output after regeneration", async () => {
    const directory = join(tmpdir(), `busu-seo-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), template);
    await generateSeoPages({ outputDirectory: directory, players: [player] });
    await generateSeoPages({ outputDirectory: directory, players: [] });
    await expect(
      readFile(join(directory, "players", id, "index.html"), "utf8"),
    ).rejects.toThrow();
  });

  it("fails on duplicate ids and makes the generic fallback non-indexable", async () => {
    const directory = join(tmpdir(), `busu-seo-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), template);
    await expect(
      generateSeoPages({
        outputDirectory: directory,
        players: [player, player],
      }),
    ).rejects.toThrow(/duplicate/u);

    await generateSeoPages({ outputDirectory: directory, players: [] });
    const fallback = await readFile(join(directory, "404.html"), "utf8");
    expect(fallback).toContain('name="robots" content="noindex,follow"');
    expect(fallback).not.toContain('rel="canonical"');
    expect(fallback).not.toContain('property="og:url"');
    expect(await readFile(join(directory, "robots.txt"), "utf8")).toBe(
      "User-agent: *\nAllow: /\nSitemap: https://busu.iamdenny.com/sitemap.xml\n",
    );
  });

  it("replaces rather than duplicates existing metadata", () => {
    const html = renderSeoHtml(
      template,
      {
        title: "검색",
        description: "설명",
        type: "website",
        robots: "noindex,follow",
      },
      "https://busu.iamdenny.com/search",
    );
    expect(html.match(/name="description"/gu)).toHaveLength(1);
  });
});
