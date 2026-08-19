import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as analytics from "../lib/analytics";
import { PlayerDetailPage } from "./PlayerDetailPage";

describe("PlayerDetailPage metadata", () => {
  afterEach(() => vi.restoreAllMocks());
  it("uses loaded player identity and record summary", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "김탁구 파워 드라이브 전문가",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe(
        "김탁구 · 파워 드라이브 전문가 선수 탁구 부수·입상 기록 · BUSU",
      ),
    );
    expect(
      document.head.querySelector('meta[property="og:type"]'),
    ).toHaveAttribute("content", "profile");
    expect(
      document.head.querySelector('meta[property="og:description"]'),
    ).toHaveAttribute(
      "content",
      "김탁구 선수 (파워 드라이브 전문가, 동명이인 기록 구분용 별칭) (서울 · 스핀탁구클럽)의 4강 이상 입상 기록 3건과 공개 출처 3곳을 확인하세요.",
    );
    expect(
      document.head.querySelector('meta[property="og:url"]'),
    ).toHaveAttribute(
      "content",
      "https://busu.iamdenny.com/players/kim-seoul/",
    );
    expect(screen.getAllByText("남자 단식")).not.toHaveLength(0);
    expect(screen.getAllByText("개인 단식")).not.toHaveLength(0);
    expect(screen.getAllByText("혼합 복식")).not.toHaveLength(0);
    expect(screen.getAllByLabelText("출처 2곳")).not.toHaveLength(0);
    expect(
      screen.getByText("통합부수 기록").nextElementSibling,
    ).toHaveTextContent("통합부수 4부");
    expect(
      screen.getAllByRole("link", { name: "가상 보조 출처" }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText(
        "(대한탁구협회 통합부수 시행 이전 · 시행일 2022.07.01)",
      ),
    ).not.toHaveLength(0);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent("입상 이력 (4강 이상)");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveTextContent("전체 이력");
    expect(tabs[2]).toHaveTextContent("출처 비교");
    expect(
      screen.queryByRole("tab", { name: "대회 부수검증" }),
    ).not.toBeInTheDocument();

    const sourceStatusToggle = screen.getByRole("button", {
      name: "상세 보기",
    });
    const sourceStatusDetails = document.getElementById(
      "player-source-status-details",
    );
    expect(sourceStatusToggle).toHaveAttribute("aria-expanded", "false");
    expect(sourceStatusDetails).toHaveAttribute("aria-hidden", "true");

    const user = userEvent.setup();
    await user.click(sourceStatusToggle);
    expect(sourceStatusToggle).toHaveAttribute("aria-expanded", "true");
    expect(sourceStatusDetails).toHaveAttribute("aria-hidden", "false");

    await user.click(
      screen.getByRole("button", {
        name: "상세 접기",
      }),
    );
    expect(sourceStatusDetails).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps an unknown player out of the search index", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/unknown-player"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "선수를 찾을 수 없습니다.",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.head.querySelector('meta[name="robots"]'),
      ).toHaveAttribute("content", "noindex,follow"),
    );
  });

  it("replaces the award total with the per-division award and entry counts", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const overview = await screen.findByRole("region", {
      name: "부수별 입상·참가 기록",
    });
    expect(screen.queryByText("과거 입상 기록")).not.toBeInTheDocument();
    expect(overview).toHaveTextContent("통합부수");
    expect(overview).toHaveTextContent("입상");
    expect(overview).toHaveTextContent("참가");
  });

  it("separates individual and team division records", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const individual = await screen.findByRole("table", { name: "개인전" });
    const team = screen.getByRole("table", { name: "단체전" });
    expect(individual).toHaveTextContent("오픈부수");
    expect(team).toHaveTextContent("통합부수");
    expect(
      screen.getByText("복식·혼성 포함 · 부수 집계 제외"),
    ).toBeInTheDocument();
  });

  it("focuses the matching records when a division is chosen", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const teamDivision = await screen.findByRole("button", {
      name: "단체전, 통합부수 5부 입상 0건 참가 1건 결과 보기",
    });
    await user.click(teamDivision);

    expect(teamDivision).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("tab", { name: "전체 이력" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByText("단체전 · 통합부수 5부 기록만 보는 중"),
    ).toBeInTheDocument();
    const history = document.getElementById("player-record-history");
    expect(history).toHaveFocus();
    expect(
      within(history!).getAllByText("서울 가상 클럽대항전"),
    ).not.toHaveLength(0);
    expect(
      within(history!).queryByText("2026 가상 전국오픈"),
    ).not.toBeInTheDocument();
  });

  it("returns to every record when the division is cleared", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "개인전, 오픈부수 5부 입상 1건 참가 0건 결과 보기",
      }),
    );
    await user.click(screen.getByRole("button", { name: "전체 보기" }));

    expect(screen.queryByText(/기록만 보는 중/u)).not.toBeInTheDocument();
    const history = document.getElementById("player-record-history");
    expect(
      within(history!).getAllByText("서울 가상 클럽대항전"),
    ).not.toHaveLength(0);
  });

  it("marks a mixed-gender record so its division is not read as a women scale", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("tab", { name: "전체 이력" }));

    const mixedRecord = screen
      .getAllByText("혼합 복식")[0]
      ?.closest("tr, article");
    expect(mixedRecord).toHaveTextContent("혼성 종목 기준");
    const singlesRecord = screen
      .getAllByText("남자 단식")[0]
      ?.closest("tr, article");
    expect(singlesRecord).not.toHaveTextContent("혼성 종목 기준");
  });

  it("drops the identity badge that never changes", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "김탁구 파워 드라이브 전문가" });
    expect(screen.queryByText("소속·지역 확인 필요")).not.toBeInTheDocument();
  });

  it("marks records the division summary leaves out", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("tab", { name: "전체 이력" }));

    const doublesRecord = screen
      .getAllByText("혼합 복식")[0]
      ?.closest("td, dd");
    expect(doublesRecord).toHaveTextContent("복식");
    expect(
      screen.getAllByTitle(
        "단체·복식·혼성 입상은 현재 추정 부수 집계에서 제외합니다.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows an empty award state before the complete history", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-busan"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("4강 이상 입상 이력이 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("8강")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "전체 이력" }));

    expect(screen.getAllByText("8강")).not.toHaveLength(0);
  });

  it("tracks only actual detail tab changes", async () => {
    const user = userEvent.setup();
    const track = vi.spyOn(analytics, "trackAnalyticsEvent");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/players/kim-seoul"]}>
          <Routes>
            <Route path="/players/:id" element={<PlayerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", {
      name: "김탁구 파워 드라이브 전문가",
    });

    await user.click(screen.getByRole("tab", { name: "입상 이력 (4강 이상)" }));
    expect(track).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "전체 이력" }));
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("player_detail_tab_selected", {
      player_id: "kim-seoul",
      detail_tab: "history",
    });
  });
});
