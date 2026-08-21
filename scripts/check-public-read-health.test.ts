import { describe, expect, it, vi } from "vitest";
import {
  checkPublicReadHealth,
  checkPublicReadHealthFromEnvironment,
} from "./check-public-read-health";

const id = "11111111-1111-4111-8111-111111111111";
const manifestRow = {
  id,
  canonical_name: "김탁구",
  recent_observed_division: "6부",
  recent_awards: [],
  source_names: ["애즈트리"],
  last_checked_at: "2026-08-21T00:00:00.000Z",
};

describe("production public read health check", () => {
  it("checks manifest, search, and detail through the public API", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([manifestRow])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "result" }])));
    await expect(
      checkPublicReadHealth({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetcher,
      }),
    ).resolves.toHaveLength(3);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/public_player_seo_manifest",
    );
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      "/public_player_search",
    );
    expect(String(fetcher.mock.calls[2]?.[0])).toContain("/public_results");
  });

  it("fails closed on HTTP errors, empty rows, and missing configuration", async () => {
    await expect(
      checkPublicReadHealth({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
      }),
    ).rejects.toThrow(/500/u);
    await expect(
      checkPublicReadHealth({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify([]))),
      }),
    ).rejects.toThrow(/no public rows/u);
    await expect(checkPublicReadHealthFromEnvironment({})).rejects.toThrow(
      /configuration is required/u,
    );
  });

  it("fails when a public read exceeds its deployment budget", async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify([{ id, canonical_name: "김탁구" }]));
    });
    await expect(
      checkPublicReadHealth({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetcher,
        maxDurationMs: 1,
      }),
    ).rejects.toThrow(/exceeded/u);
  });

  it("aborts a public read that reaches the request timeout", async () => {
    const fetcher = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    );
    await expect(
      checkPublicReadHealth({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetcher,
        timeoutMs: 1,
      }),
    ).rejects.toThrow(/aborted/u);
  });
});

describe("manifest record snapshot", () => {
  it("fails closed when the record columns are missing", async () => {
    await expect(
      checkPublicReadHealth({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetcher: vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify([{ id, canonical_name: "김탁구" }])),
          ),
      }),
    ).rejects.toThrow(/recent_observed_division/u);
  });

  it("rejects a snapshot that is not an award array", async () => {
    await expect(
      checkPublicReadHealth({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetcher: vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify([{ ...manifestRow, recent_awards: null }]),
            ),
          ),
      }),
    ).rejects.toThrow(/record snapshot/u);
  });
});
