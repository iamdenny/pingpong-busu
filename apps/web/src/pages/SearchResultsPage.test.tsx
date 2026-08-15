import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playerRepository } from "../lib/runtime";
import {
  SourceRefreshRateLimitError,
  SourceRefreshTimeoutError,
} from "../lib/sourceRefreshRetry";
import {
  clearManualRetryAttempts,
  isForcedSourceRefresh,
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
  afterEach(() => vi.restoreAllMocks());

  it("forces only an explicit manual source retry", () => {
    expect(isForcedSourceRefresh(undefined, "cycle-a")).toBe(false);
    expect(
      isForcedSourceRefresh(
        { requestId: 1, searchCycleKey: "cycle-a" },
        "cycle-a",
      ),
    ).toBe(true);
    expect(
      isForcedSourceRefresh(
        { requestId: 1, searchCycleKey: "cycle-a" },
        "cycle-b",
      ),
    ).toBe(false);
  });

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

  it("renders general and women observations on separate integrated rows", async () => {
    vi.spyOn(playerRepository, "listSourceStatuses").mockResolvedValue([]);
    vi.spyOn(playerRepository, "searchPlayers").mockResolvedValue([
      {
        id: "song-suwon",
        name: "송승희",
        normalizedName: "송승희",
        divisionObservations: [
          {
            system: "integrated",
            division: "9부",
            awardCount: 0,
            participationCount: 1,
          },
          {
            system: "integrated",
            division: "희망부",
            awardCount: 0,
            participationCount: 2,
          },
          {
            system: "women",
            division: "6부",
            awardCount: 2,
            participationCount: 3,
          },
          {
            system: "women",
            division: "새싹",
            awardCount: 1,
            participationCount: 0,
          },
        ],
        resultCount: 3,
        sourceCount: 1,
        lastCheckedAt: "2026-08-15T00:00:00.000Z",
        identityStatus: "unreviewed",
      },
    ]);

    renderSearch("송승희");

    const summary = await screen.findByRole("region", {
      name: "현재 추정 부수",
    });
    const integratedHeader = within(summary).getByRole("rowheader", {
      name: "통합부수",
    });
    const generalButton = within(summary).getByRole("button", {
      name: "통합부수 9부 입상 0건 참가 1건 결과 보기",
    });
    const womenButton = within(summary).getByRole("button", {
      name: "통합부수 여자6부 입상 2건 참가 3건 결과 보기",
    });

    expect(integratedHeader).toHaveAttribute("rowspan", "2");
    expect(generalButton.closest("tr")).not.toBe(womenButton.closest("tr"));
    expect(generalButton.closest("tr")).toHaveTextContent("희망부");
    expect(womenButton.closest("tr")).toHaveTextContent("여자새싹");
    expect(
      within(generalButton).getByText("입상").closest("span"),
    ).not.toHaveClass("division-overview__award-count--positive");
    expect(within(womenButton).getByText("입상").closest("span")).toHaveClass(
      "division-overview__award-count--positive",
    );
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
    ).toHaveAttribute("content", "https://busu.iamdenny.com/search/");
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,follow",
    );
    expect(screen.getByText("2건")).toBeInTheDocument();
    const awardSummary = screen.getByText("우승").closest("dd");
    expect(awardSummary).not.toBeNull();
    expect(within(awardSummary!).getByText("3위")).toBeInTheDocument();
    expect(
      within(awardSummary!).getByText("2026 가상 전국오픈"),
    ).toBeInTheDocument();
    expect(
      within(awardSummary!).getByText("서울 가상 생활체육대회"),
    ).toBeInTheDocument();
    expect(within(awardSummary!).getByText("남자 단식")).toBeInTheDocument();
    expect(within(awardSummary!).getByText("개인 단식")).toBeInTheDocument();
    const awardDates = awardSummary!.querySelectorAll("time");
    expect(awardDates).toHaveLength(2);
    expect(awardDates[0]).toHaveAttribute("datetime", "2026-07-20");
    expect(awardDates[0]?.parentElement).toHaveClass(
      "award-result-summary__item",
    );
    expect(awardDates[1]).toHaveAttribute("datetime", "2026-04-06");
    expect(within(awardSummary!).queryByText("외 1건")).not.toBeInTheDocument();
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
      within(summary).getByText("최근 개인전 기록 기준"),
    ).toBeInTheDocument();
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
    expect(within(list).getByText("부산 가상 구대회")).toBeInTheDocument();
    expect(within(list).getByText("단식")).toBeInTheDocument();
    expect(within(list).getByText("2025. 9. 14.")).toBeInTheDocument();

    fireEvent.click(within(tabs).getByRole("tab", { name: "입상 1건" }));
    expect(tabs).toHaveAttribute("data-active-tab", "awards");
    expect(
      screen.getByRole("tabpanel", { name: "입상 선수 검색 결과 목록" }),
    ).toHaveAttribute("data-transition-direction", "backward");
    expect(screen.getByText(/같은 이름의 선수가 여러 명/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    ).toBeInTheDocument();
  });

  it("offers alias grouping for a single search candidate without a homonym warning", async () => {
    const [candidate] = await playerRepository.searchPlayers({
      query: "김탁구",
      region: "서울",
    });
    if (!candidate) throw new Error("단일 후보 데모 데이터가 필요합니다.");
    vi.spyOn(playerRepository, "searchPlayers").mockResolvedValue([candidate]);

    renderSearch("김탁구");

    expect(
      await screen.findByRole("button", { name: "별칭으로 기록 묶기" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/같은 이름의 선수가 여러 명/u),
    ).not.toBeInTheDocument();
  });

  it("does not offer alias grouping when no search candidate exists", async () => {
    vi.spyOn(playerRepository, "searchPlayers").mockResolvedValue([]);

    renderSearch("없는선수");

    expect(
      await screen.findByRole("heading", {
        name: "확인된 대회 기록이 없습니다.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "별칭으로 기록 묶기" }),
    ).not.toBeInTheDocument();
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

  it("separates current division summaries and filters by a verified nickname", async () => {
    const [assigned, unassigned] = await playerRepository.searchPlayers({
      query: "김탁구",
    });
    if (!assigned || !unassigned)
      throw new Error("동명이인 데모 데이터가 필요합니다.");

    vi.spyOn(playerRepository, "searchPlayers").mockResolvedValue([
      {
        ...assigned,
        identityStatus: "verified",
        homonymNickname: "데니",
        divisionObservations: [
          {
            system: "integrated",
            division: "6부",
            awardCount: 1,
            participationCount: 0,
          },
        ],
      },
      {
        ...unassigned,
        identityStatus: "unreviewed",
        divisionObservations: [
          {
            system: "integrated",
            division: "6부",
            awardCount: 0,
            participationCount: 1,
          },
        ],
      },
    ]);

    renderSearch("김탁구");

    const summary = await screen.findByRole("region", {
      name: "현재 추정 부수",
    });
    expect(
      within(summary).getByRole("heading", { name: "데니" }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("heading", { name: "미분류 기록" }),
    ).toBeInTheDocument();
    const assignedDivision = within(summary).getByRole("button", {
      name: "데니, 통합부수 6부 입상 1건 참가 0건 결과 보기",
    });
    expect(
      within(summary).getByRole("button", {
        name: "미분류 기록, 통합부수 6부 입상 0건 참가 1건 결과 보기",
      }),
    ).toBeInTheDocument();

    fireEvent.click(assignedDivision);

    expect(assignedDivision).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("데니 · 통합부수 6부")).toBeInTheDocument();
    const filteredList = screen.getByRole("tabpanel", {
      name: "데니 통합부수 6부 입상 선수 검색 결과 목록",
    });
    expect(
      within(filteredList).getByRole("link", {
        name: "김탁구 데니 서울 스핀탁구클럽 상세 기록 보기",
      }),
    ).toBeInTheDocument();
    expect(
      within(filteredList).queryByRole("link", {
        name: "김탁구 루프 드라이브 최강자 부산 블루라켓 상세 기록 보기",
      }),
    ).not.toBeInTheDocument();
  });
});
