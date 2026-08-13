import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANONYMOUS_EDITOR_STORAGE_KEY } from "../lib/anonymousEditor";
import { playerRepository } from "../lib/runtime";
import { IdentityEditHistory } from "./IdentityEditHistory";

const editorId = "00000000-0000-4000-8000-000000000099";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("IdentityEditHistory", () => {
  it("lets a participant revert the latest public edit with a reason", async () => {
    window.localStorage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, editorId);
    vi.spyOn(playerRepository, "listIdentityEditHistory").mockResolvedValue([
      {
        operationId: "00000000-0000-4000-8000-000000000001",
        referenceId: "AB12CD34",
        normalizedName: "김탁구",
        status: "applied",
        targetPlayerId: "candidate-seoul",
        targetPlayerName: "김탁구",
        reason: "같은 소속과 대회 출전 이력을 확인했습니다.",
        createdAt: "2026-08-13T10:00:00.000Z",
        canRevert: true,
        candidates: [
          {
            playerId: "candidate-seoul",
            name: "김탁구",
            region: "서울",
            club: "스핀탁구클럽",
            groupNickname: "power-drive",
          },
          {
            playerId: "candidate-gyeonggi",
            name: "김탁구",
            region: "경기",
            club: "스핀탁구클럽",
            groupNickname: "loop-drive-champion",
          },
        ],
      },
    ]);
    const revert = vi
      .spyOn(playerRepository, "revertIdentityEdit")
      .mockResolvedValue({
        reverted: true,
        operationId: "00000000-0000-4000-8000-000000000001",
        status: "reverted",
      });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <IdentityEditHistory normalizedName="김탁구" />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByText("참여 편집 이력", { selector: "span" }),
    );
    expect(screen.getByText("편집번호 AB12CD34")).toBeInTheDocument();
    expect(
      screen.getByText("변경 근거: 같은 소속과 대회 출전 이력을 확인했습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("파워 드라이브")).toBeInTheDocument();
    expect(screen.getByText("루프 드라이브 최강자")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "되돌리기" }));
    await user.type(
      screen.getByLabelText("되돌리는 근거"),
      "서로 다른 지역의 동명이인 기록임을 확인했습니다.",
    );
    expect(
      screen.queryByLabelText("편집 확인 코드 4자리"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /모든 별칭과 기록 구분이 이전 상태로 돌아감/u,
      }),
    );
    await user.click(screen.getByRole("button", { name: "기록 분리 실행" }));

    expect(revert).toHaveBeenCalledWith({
      operationId: "00000000-0000-4000-8000-000000000001",
      editorId,
      reason: "서로 다른 지역의 동명이인 기록임을 확인했습니다.",
    });
    expect(
      await screen.findByText("기록 연결을 되돌렸습니다."),
    ).toBeInTheDocument();
  });
});
