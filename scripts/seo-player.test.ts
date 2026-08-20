import { describe, expect, it } from "vitest";
import {
  playerBreadcrumb,
  playerDisplayName,
  playerJsonLd,
  playerSummarySentence,
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
  recent_observed_division: "6부",
  recent_observed_division_system: "integrated",
  recent_awards: [
    {
      rank: "우승",
      date: "2026-05-03",
      tournament: "제5회 물결배",
      event: "개인전",
      division: "6부",
      division_system: "integrated",
    },
    {
      rank: "4강",
      date: "2025-11-02",
      tournament: "가을 리그",
      event: "여자 단식",
      division: "6부",
      division_system: "women",
    },
  ],
  source_names: ["아스트리 탁구", "마이탁구"],
  last_checked_at: "2026-08-19T04:05:06.000Z",
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

describe("static player records", () => {
  it("renders the observed division, award table and sources in the raw markup", () => {
    const html = renderPlayerBody(base, "/");
    expect(html).toContain("<dd>통합부수 6부</dd>");
    expect(html).toContain("제5회 물결배");
    expect(html).toContain("<td>우승</td>");
    expect(html).toContain('<time datetime="2026-05-03">');
    expect(html).toContain("통합부수 여자6부");
    expect(html).toContain("아스트리 탁구");
    expect(html).toContain('<time datetime="2026-08-19">');
  });

  it("leads with a sentence that answers the division on its own", () => {
    expect(playerSummarySentence(base)).toContain(
      "김탁구 선수의 최근 관측 부수는 통합부수 6부입니다.",
    );
    expect(playerSummarySentence(base)).toContain("4강 이상 입상 3건");
    expect(playerSummarySentence(base)).toContain("2026년 8월 19일");
  });

  it("states plainly when no division or award was observed", () => {
    const bare = {
      ...base,
      recent_observed_division: null,
      recent_observed_division_system: null,
      recent_awards: [],
      source_names: [],
      last_checked_at: null,
    };
    expect(playerSummarySentence(bare)).toContain(
      "최근 관측 부수가 확인되지 않았습니다",
    );
    const html = renderPlayerBody(bare, "/");
    expect(html).toContain("<dd>확인 필요</dd>");
    expect(html).toContain("4강 이상 입상 기록이 아직 없습니다");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("확인한 공개 출처");
  });

  it("escapes record text that came from a source", () => {
    const html = renderPlayerBody(
      {
        ...base,
        recent_awards: [
          {
            rank: "<b>우승</b>",
            date: "2026-05-03",
            tournament: "<script>",
            event: null,
            division: null,
            division_system: null,
          },
        ],
        source_names: ["<img>"],
      },
      "/",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("publishes the records as structured data with a freshness date", () => {
    const [profile, , list] = playerJsonLd(base) as Record<string, unknown>[];
    expect(profile?.dateModified).toBe("2026-08-19T04:05:06.000Z");
    expect(profile?.description).toContain("통합부수 6부");
    const person = profile?.mainEntity as Record<string, unknown>;
    expect(person.award).toHaveLength(2);
    expect((person.award as string[])[0]).toContain("제5회 물결배");
    expect(list?.["@type"]).toBe("ItemList");
    expect(list?.numberOfItems).toBe(2);
    const first = (list?.itemListElement as Record<string, unknown>[])[0];
    const event = first?.item as Record<string, unknown>;
    expect(event.startDate).toBe("2026-05-03");
    expect(event["@type"]).toBe("SportsEvent");
  });

  it("omits the award list when nothing was observed", () => {
    expect(playerJsonLd({ ...base, recent_awards: [] })).toHaveLength(2);
  });
});
