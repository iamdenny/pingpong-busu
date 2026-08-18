import { describe, expect, it } from "vitest";
import {
  playerBreadcrumb,
  playerDisplayName,
  playerJsonLd,
  renderPlayerBody,
} from "./seo-player";
import type { SeoPlayer } from "./generate-seo-pages";

const base: SeoPlayer = {
  id: "11111111-1111-4111-8111-111111111111",
  canonical_name: "김탁구",
  homonym_nickname: null,
  primary_region: "경기도 용인시",
  primary_club: "물결 탁구 동호회",
  result_count: 3,
  source_count: 2,
};

describe("static player summary", () => {
  it("carries the identity and counts in the raw markup", () => {
    const html = renderPlayerBody(base, "/");
    expect(html).toContain("<h1>김탁구 선수 탁구 부수·입상 기록</h1>");
    expect(html).toContain("경기도 용인시 · 물결 탁구 동호회");
    expect(html).toContain("<dd>3건</dd>");
    expect(html).toContain("<dd>2곳</dd>");
    expect(html).toContain('href="/directory/g/"');
    expect(html).toContain('href="/directory/"');
  });

  it("escapes player-controlled text", () => {
    const html = renderPlayerBody(
      { ...base, canonical_name: '김<&"탁구', primary_club: "<script>" },
      "/",
    );
    expect(html).toContain("김&lt;&amp;&quot;탁구");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("states when no region or club is public", () => {
    const html = renderPlayerBody(
      { ...base, primary_region: null, primary_club: null },
      "/",
    );
    expect(html).toContain("공개된 지역·소속 정보 없음");
  });

  it("honours a nested base path", () => {
    expect(renderPlayerBody(base, "/pingpong-busu/")).toContain(
      'href="/pingpong-busu/directory/g/"',
    );
  });

  it("includes the homonym alias in the display name", () => {
    expect(playerDisplayName(base)).toBe("김탁구");
    expect(
      playerDisplayName({ ...base, homonym_nickname: "서울 드라이브" }),
    ).toContain("서울 드라이브");
  });
});

describe("player structured data", () => {
  it("emits ProfilePage with a Person main entity", () => {
    const [profile] = playerJsonLd(base) as Record<string, unknown>[];
    expect(profile?.["@type"]).toBe("ProfilePage");
    expect(profile?.url).toBe(`https://busu.iamdenny.com/players/${base.id}/`);
    const person = profile?.mainEntity as Record<string, unknown>;
    expect(person["@type"]).toBe("Person");
    expect(person.name).toBe("김탁구");
    expect(person.homeLocation).toBe("경기도 용인시");
    expect((person.affiliation as Record<string, unknown>).name).toBe(
      "물결 탁구 동호회",
    );
  });

  it("omits optional fields that are not public", () => {
    const [profile] = playerJsonLd({
      ...base,
      primary_region: null,
      primary_club: null,
    }) as Record<string, unknown>[];
    const person = profile?.mainEntity as Record<string, unknown>;
    expect(person).not.toHaveProperty("homeLocation");
    expect(person).not.toHaveProperty("affiliation");
  });

  it("builds a four step breadcrumb ending at the player", () => {
    const crumbs = playerBreadcrumb(base);
    expect(crumbs.map((c) => c.name)).toEqual([
      "BUSU 홈",
      "탁구 선수 전체 목록",
      "ㄱ 시작 선수",
      "김탁구",
    ]);
    expect(crumbs.at(-1)?.url).toBe(
      `https://busu.iamdenny.com/players/${base.id}/`,
    );
    const [, breadcrumb] = playerJsonLd(base) as Record<string, unknown>[];
    expect(breadcrumb?.["@type"]).toBe("BreadcrumbList");
  });
});
