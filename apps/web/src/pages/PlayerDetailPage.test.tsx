import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PlayerDetailPage } from "./PlayerDetailPage";

describe("PlayerDetailPage metadata", () => {
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
        name: "김탁구 파워 드라이브",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe(
        "김탁구 · 파워 드라이브 선수 탁구 부수·입상 기록 · BUSU",
      ),
    );
    expect(
      document.head.querySelector('meta[property="og:type"]'),
    ).toHaveAttribute("content", "profile");
    expect(
      document.head.querySelector('meta[property="og:description"]'),
    ).toHaveAttribute(
      "content",
      "김탁구 선수 (파워 드라이브, 동명이인 기록 구분용 별칭) (서울 · 스핀탁구클럽)의 최근 관측 오픈부수 5부, 대회 출전 3건과 4강 이상 입상 3건의 원문 출처를 확인하세요.",
    );
    expect(
      document.head.querySelector('meta[property="og:url"]'),
    ).toHaveAttribute(
      "content",
      "https://busu.iamdenny.com/#/players/kim-seoul",
    );
    expect(screen.getAllByText("남자 단식")).not.toHaveLength(0);
    expect(screen.getAllByText("개인 단식")).not.toHaveLength(0);
    expect(screen.getAllByText("혼합 복식")).not.toHaveLength(0);
  });
});
