import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initUmamiAnalytics,
  safeSearchTerm,
  searchResultBucket,
  trackAnalyticsEvent,
  trackSearchSubmitted,
} from "./analytics";

describe("Umami analytics", () => {
  beforeEach(() => {
    const existingScript = document.getElementById("umami-analytics");
    existingScript?.dispatchEvent(new Event("error"));
    existingScript?.remove();
    delete window.umami;
  });

  it("loads only a valid public Umami configuration and excludes query strings", () => {
    expect(
      initUmamiAnalytics({
        scriptUrl: "https://analytics.iamdenny.com/script.js",
        websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
      }),
    ).toBe(true);

    const script = document.getElementById(
      "umami-analytics",
    ) as HTMLScriptElement;
    expect(script.src).toBe("https://analytics.iamdenny.com/script.js");
    expect(script.dataset.websiteId).toBe(
      "936a1390-e35f-4afa-a843-353b6c4f5854",
    );
    expect(script.dataset.excludeSearch).toBe("true");
  });

  it("rejects missing, insecure, malformed, and duplicate tracker configuration", () => {
    expect(
      initUmamiAnalytics({ scriptUrl: undefined, websiteId: undefined }),
    ).toBe(false);
    expect(
      initUmamiAnalytics({
        scriptUrl: "http://analytics.iamdenny.com/script.js",
        websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
      }),
    ).toBe(false);
    expect(
      initUmamiAnalytics({
        scriptUrl: "https://analytics.iamdenny.com/script.js",
        websiteId: "not-an-id",
      }),
    ).toBe(false);
    document.head.insertAdjacentHTML(
      "beforeend",
      '<script id="umami-analytics"></script>',
    );
    expect(
      initUmamiAnalytics({
        scriptUrl: "https://analytics.iamdenny.com/script.js",
        websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
      }),
    ).toBe(false);
  });

  it("rejects executable script URLs outside the dedicated origin and path", () => {
    expect(
      initUmamiAnalytics({
        scriptUrl: "https://other-project.vercel.app/script.js",
        websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
      }),
    ).toBe(false);
    expect(
      initUmamiAnalytics({
        scriptUrl: "https://analytics.iamdenny.com/other.js?token=value",
        websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
      }),
    ).toBe(false);
  });

  it("never throws when the DOM rejects tracker injection", () => {
    const append = vi.spyOn(document.head, "append").mockImplementation(() => {
      throw new Error("blocked by policy");
    });
    expect(() =>
      initUmamiAnalytics({
        scriptUrl: "https://analytics.iamdenny.com/script.js",
        websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
      }),
    ).not.toThrow();
    expect(append).toHaveBeenCalledOnce();
    append.mockRestore();
  });

  it.each([
    [" 김탁구   용인 ", "김탁구 용인"],
    ["player-name", "player-name"],
    ["test@example.com", undefined],
    ["010-1234-5678", undefined],
    ["김탁구 주소", undefined],
    ["김탁구 / 용인", undefined],
    ["김철수 서울특별시 강남구 역삼동", undefined],
    ["김철수 우리집은 강남구", undefined],
    ["김철수 계좌번호", undefined],
    ["김철수 경기도 용인시", "김철수 경기도 용인시"],
    ["김", undefined],
  ])("sanitizes search event data", (input, expected) => {
    expect(safeSearchTerm(input)).toBe(expected);
  });

  it("uses coarse result count buckets", () => {
    expect([0, 1, 2, 8, 21].map(searchResultBucket)).toEqual([
      "0",
      "1",
      "2-5",
      "6-20",
      "21+",
    ]);
  });

  it("sends only safe search terms and tolerates tracker failures", () => {
    const track = vi.fn();
    initUmamiAnalytics({
      scriptUrl: "https://analytics.iamdenny.com/script.js",
      websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
    });
    window.umami = { track };
    trackSearchSubmitted("김탁구 용인", 3);
    trackSearchSubmitted("test@example.com", 0);
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("search_submitted", {
      query: "김탁구 용인",
      result_bucket: "2-5",
    });

    window.umami = {
      track: () => {
        throw new Error("blocked");
      },
    };
    expect(() => trackAnalyticsEvent("player_source_clicked")).not.toThrow();
  });

  it("queues events until the asynchronous tracker is ready", () => {
    initUmamiAnalytics({
      scriptUrl: "https://analytics.iamdenny.com/script.js",
      websiteId: "936a1390-e35f-4afa-a843-353b6c4f5854",
    });
    trackAnalyticsEvent("search_result_clicked", { player_id: "player-1" });
    const track = vi.fn();
    window.umami = { track };
    document
      .getElementById("umami-analytics")
      ?.dispatchEvent(new Event("load"));
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("search_result_clicked", {
      player_id: "player-1",
    });
  });
});
