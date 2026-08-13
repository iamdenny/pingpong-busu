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
import {
  SourceRefreshRateLimitError,
  SourceRefreshTimeoutError,
} from "../lib/sourceRefreshRetry";
import {
  clearManualRetryAttempts,
  SearchResultsPage,
  sourceRefreshFailureView,
  sourceRetryKey,
} from "./SearchResultsPage";

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
  it("resets the manual retry budget after a source succeeds", () => {
    const key = sourceRetryKey("임\n대현", "airping");
    const exhausted = { [key]: { attempts: 3, lastAttemptAt: 10_000 } };

    expect(key).not.toContain("\n");
    const recovered = clearManualRetryAttempts(exhausted, [key]);

    expect(recovered).toEqual({});
    expect(clearManualRetryAttempts(recovered, [key])).toBe(recovered);
  });

  it("preserves timeout failure details after automatic retry exhaustion", () => {
    expect(
      sourceRefreshFailureView(new SourceRefreshTimeoutError(5_000, 10_000)),
    ).toEqual({
      errorCode: "source_timeout",
      message: "자동 재시도 후에도 출처 응답 시간이 초과되었습니다.",
      retryAt: 15_000,
    });
  });

  it("keeps the existing rate-limit failure details", () => {
    expect(
      sourceRefreshFailureView(new SourceRefreshRateLimitError(5_000, 10_000)),
    ).toEqual({
      errorCode: "source_rate_limited",
      message: "자동 재시도 후에도 호출 제한이 해제되지 않았습니다.",
      retryAt: 15_000,
    });
  });

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
    const awardSummary = screen.getByText("우승").closest("dd");
    expect(awardSummary).not.toBeNull();
    expect(within(awardSummary!).getByText("3위")).toBeInTheDocument();
    const awardDates = awardSummary!.querySelectorAll("time");
    expect(awardDates).toHaveLength(2);
    expect(awardDates[0]).toHaveAttribute("datetime", "2026-07-20");
    expect(awardDates[0]?.parentElement).toHaveClass(
      "award-result-summary__item",
    );
    expect(awardDates[1]).toHaveAttribute("datetime", "2026-04-06");
    expect(within(awardSummary!).getByText("외 1건")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "김탁구 파워 드라이브 전문가 서울 스핀탁구클럽 상세 기록 보기",
      }),
    ).toHaveAttribute("href", "/players/kim-seoul");
    expect(
      screen.queryByRole("link", { name: "상세 보기" }),
    ).not.toBeInTheDocument();
    const playerCard = screen
      .getByRole("link", {
        name: "김탁구 파워 드라이브 전문가 서울 스핀탁구클럽 상세 기록 보기",
      })
      .querySelector("article");
    expect(playerCard?.querySelector(".candidate-card__footer")).toBeNull();
    expect(
      playerCard?.querySelector(".candidate-card__meta"),
    ).toHaveTextContent("최근 확인");

    const summary = screen.getByRole("region", { name: "현재 추정 부수" });
    expect(
      within(summary).getByRole("rowheader", { name: "오픈부수" }),
    ).toBeInTheDocument();
    const integratedRowHeader = within(summary).getByRole("rowheader", {
      name: "통합부수",
    });
    const integratedRow = integratedRowHeader.closest("tr");
    expect(integratedRow).not.toBeNull();
    expect(within(integratedRow!).getAllByRole("button")).toHaveLength(2);
    expect(
      within(summary).getByRole("button", {
        name: "오픈부수 5부 입상 1건 참가 0건 결과 보기",
      }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("button", {
        name: "통합부수 4부 입상 1건 참가 0건 결과 보기",
      }),
    ).toBeInTheDocument();
    const integratedSix = within(summary).getByRole("button", {
      name: "통합부수 6부 입상 0건 참가 1건 결과 보기",
    });
    expect(integratedSix).toHaveAttribute("aria-controls", "candidate-results");

    fireEvent.click(integratedSix);

    expect(integratedSix).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("통합부수 6부", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1건만 표시 중")).toBeInTheDocument();
    const filteredList = screen.getByRole("tabpanel", {
      name: "통합부수 6부 출전 선수 검색 결과 목록",
    });
    await waitFor(() => expect(filteredList).toHaveFocus());
    expect(
      within(filteredList).getByRole("link", {
        name: "김탁구 루프 드라이브 최강자 부산 블루라켓 상세 기록 보기",
      }),
    ).toBeInTheDocument();
    expect(
      within(filteredList).queryByRole("link", {
        name: "김탁구 파워 드라이브 전문가 서울 스핀탁구클럽 상세 기록 보기",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "부수 필터 해제" }));
    expect(integratedSix).toHaveAttribute("aria-pressed", "false");

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
    expect(tabs.closest(".result-tabs-sticky")).not.toBeNull();
    expect(tabs).toHaveAttribute("data-active-tab", "awards");
    expect(within(tabs).getByRole("tab", { name: "입상 1건" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(within(tabs).getByRole("tab", { name: "출전 1건" }));
    expect(tabs).toHaveAttribute("data-active-tab", "entries");
    const list = screen.getByRole("tabpanel", {
      name: "출전 선수 검색 결과 목록",
    });
    expect(list).toHaveAttribute("data-transition-direction", "forward");
    expect(within(list).getByText("0건")).toBeInTheDocument();

    fireEvent.click(within(tabs).getByRole("tab", { name: "입상 1건" }));
    expect(tabs).toHaveAttribute("data-active-tab", "awards");
    expect(
      screen.getByRole("tabpanel", { name: "입상 선수 검색 결과 목록" }),
    ).toHaveAttribute("data-transition-direction", "backward");
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
      screen.getByRole("link", {
        name: "김탁구 루프 드라이브 최강자 부산 블루라켓 상세 기록 보기",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/같은 이름의 선수가 여러 명/),
    ).not.toBeInTheDocument();
  });
});
