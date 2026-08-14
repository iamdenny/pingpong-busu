import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadRecentSearches,
  rememberRecentSearch,
} from "../lib/recentSearches";
import { HomePage } from "./HomePage";

function SearchQueryProbe() {
  const location = useLocation();
  return (
    <output data-testid="search-query">
      {new URLSearchParams(location.search).get("q")}
    </output>
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps source details compact and reveals statuses with URLs", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(document.title).toBe("BUSU · 탁구 선수 부수·입상 기록 통합검색"),
    );
    expect(
      document.head.querySelector('meta[property="og:title"]'),
    ).toHaveAttribute("content", "BUSU · 탁구 선수 부수·입상 기록 통합검색");
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute("href", "https://busu.iamdenny.com/");
    const summary = await screen.findByText("검색 출처");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("4곳 검색 중 · 전체 9곳")).toBeInTheDocument();
    fireEvent.click(screen.getByText("상세"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("뉴티티플레이")).toBeInTheDocument();
    expect(screen.getByText("애즈트리").closest("li")).toHaveTextContent(
      "검색 중",
    );
    expect(screen.getByText("마이티티").closest("li")).toHaveTextContent(
      "검색 중",
    );
    expect(screen.getByText("에어핑퐁").closest("li")).toHaveTextContent(
      "운영 설정 필요",
    );
    expect(screen.getByText("오케이핑퐁").closest("li")).toHaveTextContent(
      "운영 설정 필요",
    );
    expect(screen.getByText("슈퍼스타탁구").closest("li")).toHaveTextContent(
      "검색 중",
    );
    expect(screen.getByText("아이핑").closest("li")).toHaveTextContent(
      "서버 계정 설정 필요",
    );
    expect(
      screen.getByText("용인탁구협회 다음 카페").closest("li"),
    ).toHaveTextContent("무료 API 키 설정 필요");
    expect(screen.queryByText("밴드")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "마이티티 사이트 열기" }),
    ).toHaveAttribute("href", "https://mytt.kr/");
  });

  it("offers name and name-plus-region example searches", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HomePage />
          <SearchQueryProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "김탁구" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이라켓" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "김탁구 용인" }));
    expect(screen.getByTestId("search-query")).toHaveTextContent("김탁구 용인");
  });

  it("shows saved recent searches below examples and lets users clear them", async () => {
    rememberRecentSearch("임대현");
    rememberRecentSearch("김미진 용인");

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HomePage />
          <SearchQueryProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const heading = screen.getByRole("heading", { name: "최근 검색어" });
    const recentSearches = heading.closest("section");
    expect(recentSearches).not.toBeNull();
    expect(recentSearches).toHaveTextContent(
      "최근 10개를 이 브라우저에만 저장합니다.",
    );

    await userEvent.click(screen.getByRole("button", { name: "임대현" }));
    expect(screen.getByTestId("search-query")).toHaveTextContent("임대현");
    expect(loadRecentSearches()[0]).toBe("임대현");
  });

  it("removes the recent search list when all searches are deleted", async () => {
    rememberRecentSearch("임대현");

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "전체 삭제" }));
    expect(
      screen.queryByRole("heading", { name: "최근 검색어" }),
    ).not.toBeInTheDocument();
    expect(loadRecentSearches()).toEqual([]);
  });
});
