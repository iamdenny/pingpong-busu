import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SearchResultsPage } from "./SearchResultsPage";

function renderSearch(query: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(query)}`]}>
        <Routes>
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SearchResultsPage", () => {
  it("shows dated award results, entry tabs, direct links, and whole-card detail links", async () => {
    renderSearch("김탁구");

    expect(
      screen.getByRole("heading", { name: "“김탁구” 선수" }),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByRole("heading", { name: "김탁구" }),
    ).toHaveLength(1);
    await waitFor(() =>
      expect(document.title).toBe("“김탁구” 선수 검색 결과 · BUSU"),
    );
    expect(
      document.head.querySelector('meta[property="og:description"]'),
    ).toHaveAttribute("content", expect.stringContaining("4강 이상 입상 기록"));
    expect(
      document.head.querySelector('meta[property="og:url"]'),
    ).toHaveAttribute(
      "content",
      "https://busu.iamdenny.com/#/search?q=%EA%B9%80%ED%83%81%EA%B5%AC",
    );
    expect(screen.getByText("2건")).toBeInTheDocument();
    expect(
      screen.getByText(
        /우승 \(2026\. 7\. 20\.\).*3위 \(2026\. 4\. 6\.\).*외 1건/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "김탁구 서울 스핀탁구클럽 상세 기록 보기",
      }),
    ).toHaveAttribute("href", "/players/kim-seoul");
    expect(
      screen.queryByRole("link", { name: "상세 보기" }),
    ).not.toBeInTheDocument();

    const summary = screen.getByRole("region", { name: "현재 추정 부수" });
    expect(
      within(summary).getByRole("columnheader", { name: "오픈부수" }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("columnheader", { name: "통합부수" }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("cell", { name: "5부1건" }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("cell", { name: "6부1건" }),
    ).toBeInTheDocument();

    const direct = await screen.findByRole("complementary", {
      name: "원문 사이트 직접 검색",
    });
    expect(
      within(direct).getByRole("link", { name: "에어핑퐁" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("keyword=%EA%B9%80%ED%83%81%EA%B5%AC"),
    );
    expect(
      within(direct).getByRole("link", { name: "오케이핑퐁" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("keyword=%EA%B9%80%ED%83%81%EA%B5%AC"),
    );
    expect(
      within(direct).getByRole("link", { name: "아이핑 (로그인)" }),
    ).toHaveAttribute("href", "https://www.iping.club/?pg=Search");

    const tabs = screen.getByRole("tablist", { name: "검색 결과 구분" });
    expect(within(tabs).getByRole("tab", { name: "입상 1건" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(within(tabs).getByRole("tab", { name: "출전 1건" }));
    const list = screen.getByRole("tabpanel", {
      name: "출전 선수 검색 결과 목록",
    });
    expect(within(list).getByText("0건")).toBeInTheDocument();
    expect(screen.getByText(/같은 이름의 선수가 여러 명/)).toBeInTheDocument();
  });

  it("filters same-name candidates when a region follows the player name", async () => {
    renderSearch("김탁구 부산");

    expect(
      screen.getByRole("heading", { name: "“김탁구” 선수 · 부산" }),
    ).toBeInTheDocument();
    const tabs = await screen.findByRole("tablist", { name: "검색 결과 구분" });
    expect(within(tabs).getByRole("tab", { name: "입상 0건" })).toBeDisabled();
    expect(within(tabs).getByRole("tab", { name: "출전 1건" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("link", { name: "김탁구 부산 블루라켓 상세 기록 보기" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/같은 이름의 선수가 여러 명/),
    ).not.toBeInTheDocument();
  });
});
