import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerSummary } from "@busu/domain";
import { playerRepository } from "../lib/runtime";
import { IdentityClaimDialog } from "./IdentityClaimDialog";

const candidates: PlayerSummary[] = [
  {
    id: "candidate-seoul",
    name: "김탁구",
    normalizedName: "김탁구",
    region: "서울",
    club: "스핀탁구클럽",
    recentObservedDivision: "5부",
    recentObservedDivisionSystem: "open",
    resultCount: 3,
    sourceCount: 2,
    lastCheckedAt: "2026-08-12T00:00:00.000Z",
    identityStatus: "unreviewed",
  },
  {
    id: "candidate-busan",
    name: "김탁구",
    normalizedName: "김탁구",
    region: "부산",
    club: "블루라켓",
    recentObservedDivision: "6부",
    recentObservedDivisionSystem: "integrated",
    resultCount: 0,
    sourceCount: 1,
    lastCheckedAt: "2026-08-11T00:00:00.000Z",
    identityStatus: "unreviewed",
  },
];

afterEach(() => vi.restoreAllMocks());

describe("IdentityClaimDialog", () => {
  it("submits selected candidates without exposing the private code", async () => {
    const submit = vi
      .spyOn(playerRepository, "submitIdentityClaim")
      .mockResolvedValue({
        accepted: true,
        referenceId: "AB12CD34",
        status: "pending",
      });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <IdentityClaimDialog candidates={candidates} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "내 기록 구분 돕기" }));
    expect(
      screen.getByRole("dialog", { name: "동명이인 구분 제보" }),
    ).toHaveAttribute("open");

    const submitButton = screen.getByRole("button", { name: "검토 요청" });
    fireEvent.submit(submitButton.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("후보를 한 명 이상");

    await user.click(
      screen.getByRole("checkbox", { name: /서울.*스핀탁구클럽/u }),
    );
    await user.click(screen.getByRole("checkbox", { name: /부산.*블루라켓/u }));
    await user.type(screen.getByLabelText("본인 구분 코드 4자리"), "5030");
    await user.click(
      screen.getByRole("checkbox", {
        name: /관리자 검토 전 자동으로 후보가 합쳐지지 않음/u,
      }),
    );
    await user.click(submitButton);

    expect(
      await screen.findByRole("heading", { name: "제보가 접수됐습니다." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/AB12CD34/u)).toBeInTheDocument();
    expect(screen.queryByText("5030")).not.toBeInTheDocument();
    expect(submit.mock.calls[0]?.[0]).toEqual({
      candidateIds: ["candidate-seoul", "candidate-busan"],
      privateCode: "5030",
    });
  });
});
