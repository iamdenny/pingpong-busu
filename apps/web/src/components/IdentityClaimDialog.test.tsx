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

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mockMedia(
  options: { reducedMotion?: boolean; mobile?: boolean } = {},
) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion")
        ? (options.reducedMotion ?? false)
        : (options.mobile ?? false),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderDialog() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IdentityClaimDialog candidates={candidates} />
    </QueryClientProvider>,
  );
}

describe("IdentityClaimDialog", () => {
  it("keeps the dialog open until the desktop close motion finishes", async () => {
    vi.useFakeTimers();
    mockMedia();
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "내 기록 구분 돕기" }));
    const dialog = screen.getByRole("dialog", { name: "동명이인 구분 제보" });

    fireEvent.click(
      screen.getByRole("button", { name: "동명이인 구분 제보 닫기" }),
    );
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAttribute("data-state", "closing");
    await vi.advanceTimersByTimeAsync(179);
    expect(dialog).toHaveAttribute("open");
    await vi.advanceTimersByTimeAsync(1);
    expect(dialog).not.toHaveAttribute("open");
    expect(dialog).toHaveAttribute("data-state", "closed");
  });

  it("routes Escape through one idempotent mobile close lifecycle", async () => {
    vi.useFakeTimers();
    mockMedia({ mobile: true });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "내 기록 구분 돕기" }));
    const dialog = screen.getByRole("dialog", { name: "동명이인 구분 제보" });
    const onClose = vi.fn();
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    dialog.addEventListener("close", onClose);

    const firstCancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(firstCancel);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(firstCancel.defaultPrevented).toBe(true);
    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(220);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog).not.toHaveAttribute("open");
  });

  it("closes immediately when reduced motion is requested", () => {
    mockMedia({ reducedMotion: true });
    renderDialog();
    const trigger = screen.getByRole("button", { name: "내 기록 구분 돕기" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "동명이인 구분 제보" });

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(dialog).toHaveAttribute("data-state", "closed");
  });

  it("submits selected candidates without exposing the private code", async () => {
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([
      {
        candidateId: "candidate-seoul",
        records: [
          {
            id: "record-seoul",
            date: "2026-07-19",
            tournament: "제1회 서울 라켓배 탁구대회",
            scale: "district",
            event: "개인단식(혼성 4~6부)",
            sourceCode: "astree",
            sourceName: "애즈트리",
            sourceUrl: "https://example.com/seoul",
            lastCheckedAt: "2026-08-12T00:00:00.000Z",
          },
        ],
      },
      {
        candidateId: "candidate-busan",
        records: [
          {
            id: "record-busan",
            tournament: "제2회 부산 바다배 탁구대회",
            scale: "district",
            event: "여자 개인단식 5~7부",
            sourceCode: "astree",
            sourceName: "애즈트리",
            sourceUrl: "https://example.com/busan",
            lastCheckedAt: "2026-08-11T00:00:00.000Z",
          },
        ],
      },
    ]);
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
    expect(
      await screen.findByText("제1회 서울 라켓배 탁구대회"),
    ).toBeInTheDocument();
    expect(screen.getByText("개인단식(혼성 4~6부)")).toBeInTheDocument();
    expect(screen.getByText("제2회 부산 바다배 탁구대회")).toBeInTheDocument();
    expect(screen.getByText("여자 개인단식 5~7부")).toBeInTheDocument();

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
