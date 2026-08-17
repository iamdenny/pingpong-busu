import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSummary, SourceStatus } from "@busu/domain";

import type { RefreshResponse } from "../lib/repository";

const listSourceStatuses = vi.fn<() => Promise<SourceStatus[]>>();
const searchPlayers = vi.fn<() => Promise<PlayerSummary[]>>();
const requestRefresh = vi.fn<() => Promise<RefreshResponse>>();

vi.mock("../lib/runtime", () => ({
  isDevLiveMode: false,
  isDemoMode: false,
  isSourceRefreshEnabled: true,
  playerRepository: {
    listSourceStatuses: () => listSourceStatuses(),
    searchPlayers: () => searchPlayers(),
    requestRefresh: () => requestRefresh(),
  },
  feedbackRepository: {},
  runtimeIncidentRepository: {},
}));

const { SearchResultsPage } = await import("./SearchResultsPage");

function refreshResponse(status: "queued" | "skipped"): RefreshResponse {
  return {
    refreshId: "job:7",
    accepted: true,
    sources: [
      status === "queued"
        ? {
            sourceCode: "iping",
            status: "queued",
            reason: "queued",
            message: "아이핑 최신 기록 수집을 예약했습니다.",
          }
        : { sourceCode: "iping", status: "skipped", reason: "fresh" },
    ],
  };
}

function renderSearch(): void {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={["/search?q=%EA%B9%80%ED%83%81%EA%B5%AC"]}>
        <Routes>
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("queued iPing refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listSourceStatuses.mockResolvedValue([
      {
        sourceCode: "iping",
        displayName: "아이핑",
        baseUrl: "https://www.iping.club/?pg=Search",
        adapterMode: "browser",
        enabled: true,
        parserVersion: "iping-5",
      },
    ]);
    searchPlayers.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("checks again while queued and shows the finished state without a new search", async () => {
    requestRefresh
      .mockResolvedValueOnce(refreshResponse("queued"))
      .mockResolvedValue(refreshResponse("skipped"));

    renderSearch();

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("수집 예약됨")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(60_000);

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText("최근 확인 완료")).toBeInTheDocument(),
    );
  });

  it("stops checking once the source leaves the queue", async () => {
    requestRefresh.mockResolvedValue(refreshResponse("skipped"));

    renderSearch();

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(180_000);

    expect(requestRefresh).toHaveBeenCalledTimes(1);
  });
});
