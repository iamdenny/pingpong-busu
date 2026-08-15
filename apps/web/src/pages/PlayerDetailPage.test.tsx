import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
    expect(
      screen.getAllByText(
        "(대한탁구협회 통합부수 시행 이전 · 시행일 2022.07.01)",
      ),
    ).not.toHaveLength(0);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent("입상 이력 (4강 이상)");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveTextContent("전체 이력");
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
