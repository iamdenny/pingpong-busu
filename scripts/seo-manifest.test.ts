import { describe, expect, it, vi } from "vitest";
import {
  fetchPublicPlayerManifest,
  shouldRetryWithIdentityColumns,
  MANIFEST_COLUMNS,
  MANIFEST_IDENTITY_SELECT,
  MAX_MANIFEST_AWARDS,
  parseManifest,
} from "./seo-manifest";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  canonical_name: "김탁구",
  homonym_nickname: null,
  primary_region: "서울",
  primary_club: null,
  result_count: 1,
  source_count: 1,
};

const award = {
  rank: "우승",
  date: "2026-05-03",
  tournament: "제5회 물결배",
  event: "개인전",
  division: "6부",
  division_system: "integrated",
};

describe("public SEO manifest parsing", () => {
  it("keeps the record snapshot when the extended view is deployed", () => {
    const [parsed] = parseManifest([
      {
        ...row,
        recent_observed_division: " 6부 ",
        recent_observed_division_system: "integrated",
        recent_awards: [award],
        source_names: ["아스트리 탁구", " "],
        last_checked_at: "2026-08-19T04:05:06+00:00",
      },
    ]);
    expect(parsed?.recent_observed_division).toBe("6부");
    expect(parsed?.recent_awards).toHaveLength(1);
    expect(parsed?.source_names).toEqual(["아스트리 탁구"]);
    expect(parsed?.last_checked_at).toBe("2026-08-19T04:05:06.000Z");
  });

  it("defaults the snapshot fields for an older payload", () => {
    const [parsed] = parseManifest([row]);
    expect(parsed?.recent_observed_division).toBeNull();
    expect(parsed?.recent_awards).toEqual([]);
    expect(parsed?.source_names).toEqual([]);
    expect(parsed?.last_checked_at).toBeNull();
  });

  it("rejects record values it cannot render safely", () => {
    expect(() =>
      parseManifest([{ ...row, recent_awards: [{ ...award, date: "어제" }] }]),
    ).toThrow(/date/u);
    expect(() =>
      parseManifest([
        { ...row, recent_awards: [{ ...award, division_system: "gold" }] },
      ]),
    ).toThrow(/division system/u);
    expect(() =>
      parseManifest([{ ...row, recent_awards: [{ ...award, rank: null }] }]),
    ).toThrow(/rank/u);
    expect(() =>
      parseManifest([{ ...row, last_checked_at: "언젠가" }]),
    ).toThrow(/last_checked_at/u);
    expect(() => parseManifest([{ ...row, source_names: "아스트리" }])).toThrow(
      /source_names/u,
    );
    expect(() =>
      parseManifest([{ ...row, primary_club: "가".repeat(201) }]),
    ).toThrow(/primary_club/u);
  });

  it("caps the award snapshot the view is allowed to return", () => {
    expect(() =>
      parseManifest([
        {
          ...row,
          recent_awards: Array.from(
            { length: MAX_MANIFEST_AWARDS + 1 },
            () => award,
          ),
        },
      ]),
    ).toThrow(/recent_awards/u);
  });
});

describe("manifest fetch against a database without the record columns", () => {
  const timeoutBody = JSON.stringify({
    code: "57014",
    message: "canceling statement due to statement timeout",
  });
  const missingColumnBody = JSON.stringify({
    code: "42703",
    message: "column public_player_seo_manifest.recent_awards does not exist",
  });

  it("falls back to the identity columns and still returns players", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(missingColumnBody, { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([row])));
    const players = await fetchPublicPlayerManifest({
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "public",
      fetch: fetcher,
    });
    expect(players).toHaveLength(1);
    expect(players[0]?.recent_awards).toEqual([]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      encodeURIComponent("recent_awards"),
    );
    const retried = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(retried.searchParams.get("select")).toBe(MANIFEST_IDENTITY_SELECT);
    expect(MANIFEST_COLUMNS).toContain("recent_awards");
  });

  it("keeps requesting the identity columns for later pages", async () => {
    const second = { ...row, id: "22222222-2222-4222-8222-222222222222" };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(missingColumnBody, { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([row])))
      .mockResolvedValueOnce(new Response(JSON.stringify([second])))
      .mockResolvedValueOnce(new Response(JSON.stringify([])));
    await fetchPublicPlayerManifest({
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "public",
      fetch: fetcher,
      pageSize: 1,
    });
    for (const call of fetcher.mock.calls.slice(1)) {
      const url = new URL(String(call[0]));
      expect(url.searchParams.get("select")).toBe(MANIFEST_IDENTITY_SELECT);
    }
  });

  it("does not mask an unrelated failure", async () => {
    await expect(
      fetchPublicPlayerManifest({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetch: vi
          .fn()
          .mockResolvedValue(new Response("denied", { status: 401 })),
      }),
    ).rejects.toThrow(/401/u);
    await expect(
      fetchPublicPlayerManifest({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "public",
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ message: "bad range" }), {
            status: 400,
          }),
        ),
      }),
    ).rejects.toThrow(/400/u);
  });

  it("retries only on a missing column or a cancelled statement", () => {
    expect(shouldRetryWithIdentityColumns(400, missingColumnBody)).toBe(true);
    expect(shouldRetryWithIdentityColumns(400, "source_names unknown")).toBe(
      true,
    );
    expect(shouldRetryWithIdentityColumns(400, "bad range")).toBe(false);
    expect(shouldRetryWithIdentityColumns(500, missingColumnBody)).toBe(false);
    expect(shouldRetryWithIdentityColumns(500, timeoutBody)).toBe(true);
    expect(
      shouldRetryWithIdentityColumns(
        504,
        "canceling statement due to statement timeout",
      ),
    ).toBe(true);
    expect(shouldRetryWithIdentityColumns(500, "boom")).toBe(false);
    expect(shouldRetryWithIdentityColumns(401, timeoutBody)).toBe(false);
  });

  it("falls back when the wide select cannot finish", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(timeoutBody, { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([row])));
    const players = await fetchPublicPlayerManifest({
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "public",
      fetch: fetcher,
    });
    expect(players).toHaveLength(1);
    const retried = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(retried.searchParams.get("select")).toBe(MANIFEST_IDENTITY_SELECT);
  });
});
