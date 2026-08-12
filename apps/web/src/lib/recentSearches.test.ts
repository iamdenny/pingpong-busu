import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_STORAGE_KEY,
  clearRecentSearches,
  loadRecentSearches,
  rememberRecentSearch,
} from "./recentSearches";

describe("recentSearches", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the ten latest unique normalized searches", () => {
    for (let index = 1; index <= MAX_RECENT_SEARCHES + 1; index += 1) {
      rememberRecentSearch(`선수 ${index}`);
    }
    rememberRecentSearch("  선수   5  ");

    const searches = loadRecentSearches();
    expect(searches).toHaveLength(MAX_RECENT_SEARCHES);
    expect(searches[0]).toBe("선수 5");
    expect(searches).not.toContain("선수 1");
  });

  it("ignores malformed or invalid stored data", () => {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, "not-json");
    expect(loadRecentSearches()).toEqual([]);

    window.localStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(["김탁구", 123, "", "김탁구", null]),
    );
    expect(loadRecentSearches()).toEqual(["김탁구"]);
  });

  it("clears stored searches", () => {
    rememberRecentSearch("김탁구 용인");
    clearRecentSearches();
    expect(loadRecentSearches()).toEqual([]);
  });
});
