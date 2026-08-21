import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrendingPlayers as TrendingPlayersData } from "@busu/domain";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrendingPlayers } from "./TrendingPlayers";

const listTrendingPlayers = vi.fn<() => Promise<TrendingPlayersData>>();

vi.mock("../lib/runtime", () => ({
  isDevLiveMode: false,
  isDemoMode: false,
  isSourceRefreshEnabled: false,
  playerRepository: {
    listTrendingPlayers: () => listTrendingPlayers(),
  },
  feedbackRepository: {},
  runtimeIncidentRepository: {},
}));

function trendingPlayers(count: number): TrendingPlayersData {
  return {
    updatedAt: "2026-08-21T05:20:00.000Z",
    players: Array.from({ length: count }, (_, index) => ({
      playerId: `player-${index + 1}`,
      name: `선수${index + 1}`,
      club: `클럽${index + 1}`,
    })),
  };
}

function renderTrending() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TrendingPlayers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function matchMediaWidth(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 700px)" ? narrow : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

describe("TrendingPlayers", () => {
  beforeEach(() => {
    listTrendingPlayers.mockReset();
    matchMediaWidth(false);
  });

  it("ranks ten players and links each one to its public detail page", async () => {
    listTrendingPlayers.mockResolvedValue(trendingPlayers(10));
    renderTrending();

    const entries = await screen.findAllByRole("listitem");
    expect(entries).toHaveLength(10);
    expect(screen.getByRole("link", { name: /^1위\s*선수1/u })).toHaveAttribute(
      "href",
      "/players/player-1",
    );
    expect(screen.getByRole("link", { name: /^10위\s*선수10/u })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "최근 24시간 많이 찾은 선수" }),
    ).toBeVisible();
  });

  it("never shows view counts or rank movement", async () => {
    listTrendingPlayers.mockResolvedValue(trendingPlayers(10));
    renderTrending();

    await screen.findAllByRole("listitem");
    const section = document.querySelector(".trending-players");
    expect(section?.textContent).not.toMatch(/\d+\s*회|NEW|▲|▼/u);
    expect(section?.textContent).toContain("실력·부수 순위가 아니며");
  });

  it("renders nothing until the ranking has entries", async () => {
    listTrendingPlayers.mockResolvedValue({
      updatedAt: "2026-08-21T05:20:00.000Z",
      players: [],
    });
    renderTrending();

    await waitFor(() => expect(listTrendingPlayers).toHaveBeenCalled());
    expect(document.querySelector(".trending-players")).toBeNull();
  });

  it("folds the sixth to tenth places on a narrow viewport", async () => {
    matchMediaWidth(true);
    listTrendingPlayers.mockResolvedValue(trendingPlayers(10));
    renderTrending();

    const more = await screen.findByRole("button", { name: "6~10위 더 보기" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("trending-players-rest")).toHaveAttribute(
      "inert",
    );

    await userEvent.click(more);
    expect(
      screen.getByRole("button", { name: "접기" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("trending-players-rest")).not.toHaveAttribute(
      "inert",
    );
  });
});
