import { describe, expect, it, vi } from "vitest";
import {
  legacyHashDestination,
  migrateLegacyHashRoute,
  routerBasename,
} from "./browserRouting";

describe("browser routing", () => {
  it("normalizes root and repository base paths", () => {
    expect(routerBasename("/")).toBe("/");
    expect(routerBasename("/pingpong-busu/")).toBe("/pingpong-busu");
  });

  it("maps legacy hash routes without moving search terms into the path", () => {
    expect(legacyHashDestination("#/search?q=김탁구", "/")).toBe(
      "/search?q=김탁구",
    );
    expect(
      legacyHashDestination("#/players/player-id", "/pingpong-busu/"),
    ).toBe("/pingpong-busu/players/player-id");
    expect(legacyHashDestination("#section", "/")).toBeUndefined();
  });

  it("replaces a legacy hash URL before the router starts", () => {
    window.history.replaceState(null, "", "/#/search?q=김탁구");
    const replaceState = vi.spyOn(window.history, "replaceState");

    migrateLegacyHashRoute("/");

    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/search?q=%EA%B9%80%ED%83%81%EA%B5%AC",
    );
    expect(window.location.pathname).toBe("/search");
    expect(window.location.search).toBe("?q=%EA%B9%80%ED%83%81%EA%B5%AC");
    expect(window.location.hash).toBe("");
  });
});
