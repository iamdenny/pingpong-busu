import { describe, expect, it } from "vitest";
import {
  DIRECTORY_PAGE_SIZE,
  buildDirectoryGroups,
  directoryPath,
  directoryPaths,
  groupSlugForName,
  initialConsonant,
  renderDirectoryEntryLink,
  renderDirectoryPageBody,
  renderDirectoryRootBody,
} from "./seo-directory";
import type { SeoPlayer } from "./generate-seo-pages";

function player(name: string, index: number): SeoPlayer {
  return {
    id: `${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`,
    canonical_name: name,
    homonym_nickname: null,
    primary_region: null,
    primary_club: null,
    result_count: 0,
    source_count: 1,
  };
}

describe("directory grouping", () => {
  it("folds tense consonants into their plain group", () => {
    expect(initialConsonant("김탁구")).toBe("ㄱ");
    expect(initialConsonant("깡탁구")).toBe("ㄲ");
    expect(groupSlugForName("김탁구")).toBe("g");
    expect(groupSlugForName("깡탁구")).toBe("g");
    expect(groupSlugForName("최탁구")).toBe("c");
  });

  it("routes names without a Hangul initial to the fallback group", () => {
    expect(initialConsonant("Smith")).toBeUndefined();
    expect(groupSlugForName("Smith")).toBe("etc");
    expect(groupSlugForName("")).toBe("etc");
  });

  it("sorts by name and keeps groups in consonant order", () => {
    const groups = buildDirectoryGroups([
      player("이탁구", 1),
      player("김탁구", 2),
      player("강탁구", 3),
    ]);
    expect(groups.map((group) => group.slug)).toEqual(["g", "o"]);
    expect(groups[0]?.pages[0]?.players.map((p) => p.canonical_name)).toEqual([
      "강탁구",
      "김탁구",
    ]);
  });

  it("paginates groups larger than the page size", () => {
    const players = Array.from({ length: DIRECTORY_PAGE_SIZE + 1 }, (_, i) =>
      player(`김${i.toString().padStart(4, "0")}`, i),
    );
    const [group] = buildDirectoryGroups(players);
    expect(group?.total).toBe(DIRECTORY_PAGE_SIZE + 1);
    expect(group?.pages).toHaveLength(2);
    expect(group?.pages[0]?.players).toHaveLength(DIRECTORY_PAGE_SIZE);
    expect(group?.pages[1]?.players).toHaveLength(1);
    expect(directoryPaths(buildDirectoryGroups(players))).toEqual([
      "/directory",
      "/directory/g",
      "/directory/g/2",
    ]);
  });

  it("keeps the first page free of a page number", () => {
    expect(directoryPath()).toBe("/directory");
    expect(directoryPath("g")).toBe("/directory/g");
    expect(directoryPath("g", 1)).toBe("/directory/g");
    expect(directoryPath("g", 3)).toBe("/directory/g/3");
  });
});

describe("directory rendering", () => {
  it("links every player and escapes hostile names", () => {
    const hostile = { ...player('김<&"탁구', 7), primary_region: "서울" };
    const [group] = buildDirectoryGroups([hostile]);
    const html = renderDirectoryPageBody(group!.pages[0]!, "/");
    expect(html).toContain(`href="/players/${hostile.id}/"`);
    expect(html).toContain("김&lt;&amp;&quot;탁구");
    expect(html).not.toContain('김<&"탁구');
    expect(html).toContain("서울");
  });

  it("renders group links and honours a nested base path", () => {
    const groups = buildDirectoryGroups([player("김탁구", 1)]);
    expect(renderDirectoryRootBody(groups, "/")).toContain(
      'href="/directory/g/"',
    );
    expect(renderDirectoryRootBody(groups, "/pingpong-busu/")).toContain(
      'href="/pingpong-busu/directory/g/"',
    );
    expect(renderDirectoryEntryLink("/pingpong-busu/")).toContain(
      'href="/pingpong-busu/directory/"',
    );
  });

  it("marks the current page and links the others", () => {
    const players = Array.from({ length: DIRECTORY_PAGE_SIZE + 1 }, (_, i) =>
      player(`김${i.toString().padStart(4, "0")}`, i),
    );
    const [group] = buildDirectoryGroups(players);
    const html = renderDirectoryPageBody(group!.pages[1]!, "/");
    expect(html).toContain('<span aria-current="page">2</span>');
    expect(html).toContain('href="/directory/g/"');
    expect(html).toContain("탁구 선수 전체 목록");
  });
});
