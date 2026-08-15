import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildCanonicalUrl, PageMetadata } from "./PageMetadata";

function metaContent(selector: string): string | null {
  return (
    document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null
  );
}

describe("PageMetadata", () => {
  it("builds production canonical URLs for path routes", () => {
    expect(buildCanonicalUrl("/")).toBe("https://busu.iamdenny.com/");
    expect(buildCanonicalUrl("/search/")).toBe(
      "https://busu.iamdenny.com/search/",
    );
    expect(buildCanonicalUrl("//example.com/players/id")).toBe(
      "https://busu.iamdenny.com//example.com/players/id",
    );
  });

  it("updates standard, Open Graph, and Twitter metadata", async () => {
    render(
      <MemoryRouter initialEntries={["/players/player-id"]}>
        <Routes>
          <Route
            path="/players/:id"
            element={
              <PageMetadata
                title="김탁구 선수 기록 · BUSU"
                description="김탁구 선수의 공개 대회 기록입니다."
                type="profile"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(document.title).toBe("김탁구 선수 기록 · BUSU"));
    expect(
      document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        ?.href,
    ).toBe("https://busu.iamdenny.com/players/player-id/");
    expect(metaContent('meta[name="description"]')).toBe(
      "김탁구 선수의 공개 대회 기록입니다.",
    );
    expect(metaContent('meta[property="og:type"]')).toBe("profile");
    expect(metaContent('meta[property="og:title"]')).toBe(
      "김탁구 선수 기록 · BUSU",
    );
    expect(metaContent('meta[property="og:url"]')).toBe(
      "https://busu.iamdenny.com/players/player-id/",
    );
    expect(metaContent('meta[property="og:image"]')).toBe(
      "https://busu.iamdenny.com/busu-og.png",
    );
    expect(metaContent('meta[name="twitter:card"]')).toBe(
      "summary_large_image",
    );
    expect(metaContent('meta[name="twitter:title"]')).toBe(
      "김탁구 선수 기록 · BUSU",
    );
    expect(metaContent('meta[name="robots"]')).toBe("index,follow");
  });
});
