import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerSummary } from "@busu/domain";
import { ANONYMOUS_EDITOR_STORAGE_KEY } from "../lib/anonymousEditor";
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

const editorId = "00000000-0000-4000-8000-000000000099";

function renderDialog(inputCandidates: readonly PlayerSummary[] = candidates) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IdentityClaimDialog candidates={inputCandidates} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("IdentityClaimDialog", () => {
  it("assigns records to memorable table-tennis aliases", async () => {
    window.localStorage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, editorId);
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([
      {
        candidateId: "candidate-seoul",
        status: "loaded",
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
        status: "loaded",
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
      .spyOn(playerRepository, "applyIdentityEdit")
      .mockResolvedValue({
        accepted: true,
        referenceId: "AB12CD34",
        operationId: "00000000-0000-4000-8000-000000000001",
        status: "applied",
        groupCount: 2,
      });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "동명이인 구분하기" }));
    expect(
      screen.getByRole("dialog", { name: "동명이인 기록 구분하기" }),
    ).toHaveAttribute("open");
    expect(
      await screen.findByText("제1회 서울 라켓배 탁구대회"),
    ).toBeInTheDocument();
    expect(screen.getByText("여자 개인단식 5~7부")).toBeInTheDocument();
    expect(
      screen.getByText(/실제 실력이나 공식 등급을 뜻하지 않습니다/u),
    ).toBeInTheDocument();

    const submitButton = screen.getByRole("button", {
      name: "구분 바로 반영",
    });
    fireEvent.submit(submitButton.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("별칭 두 개 이상");

    const seoulCandidate = screen.getByRole("group", {
      name: /서울.*스핀탁구클럽/u,
    });
    const busanCandidate = screen.getByRole("group", {
      name: /부산.*블루라켓/u,
    });
    await user.click(
      within(seoulCandidate).getByRole("radio", { name: "파워 드라이브" }),
    );
    await user.click(
      within(busanCandidate).getByRole("radio", {
        name: "루프 드라이브 최강자",
      }),
    );
    expect(
      screen.queryByLabelText("편집 확인 코드 4자리"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /잘못된 경우 다른 참여자가 이 편집 전체를 되돌릴 수/u,
      }),
    );
    await user.click(submitButton);

    expect(
      await screen.findByRole("heading", {
        name: "동명이인 기록을 구분했습니다.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/AB12CD34/u)).toBeInTheDocument();
    expect(submit.mock.calls[0]?.[0]).toEqual({
      groups: [
        { nickname: "power-drive", candidateIds: ["candidate-seoul"] },
        {
          nickname: "loop-drive-champion",
          candidateIds: ["candidate-busan"],
        },
      ],
      editorId,
      note: "public-record-comparison",
    });
  });

  it("adds another person with a distinct curated alias", async () => {
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "동명이인 구분하기" }));
    await user.click(screen.getByRole("button", { name: "사람 추가" }));

    expect(screen.getByRole("combobox", { name: "사람 3 별칭" })).toHaveValue(
      "back-drive-master",
    );
    expect(
      screen.getByRole("button", {
        name: "사람 3 백드라이브 마스터 삭제",
      }),
    ).toBeInTheDocument();
  });

  it("classifies more than ten candidates without a record limit", async () => {
    window.localStorage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, editorId);
    const manyCandidates = Array.from({ length: 12 }, (_, index) => ({
      ...candidates[0]!,
      id: "candidate-" + (index + 1),
      club: "소속 " + (index + 1),
    }));
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue(
      manyCandidates.map((candidate) => ({
        candidateId: candidate.id,
        status: "loaded" as const,
        records: [],
      })),
    );
    const apply = vi
      .spyOn(playerRepository, "applyIdentityEdit")
      .mockResolvedValue({
        accepted: true,
        referenceId: "LIMITLESS",
        operationId: "00000000-0000-4000-8000-000000000002",
        status: "applied",
        groupCount: 2,
      });
    const user = userEvent.setup();
    renderDialog(manyCandidates);

    await user.click(screen.getByRole("button", { name: "동명이인 구분하기" }));
    for (const [index, candidate] of manyCandidates.entries()) {
      const candidateGroup = screen.getByRole("group", {
        name: new RegExp("· " + (candidate.club ?? "") + " ·"),
      });
      fireEvent.click(
        within(candidateGroup).getByRole("radio", {
          name: index < 6 ? "파워 드라이브" : "루프 드라이브 최강자",
        }),
      );
    }
    expect(screen.getByText(/분류 12건 · 전체 12건/u)).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /잘못된 경우 다른 참여자가 이 편집 전체를 되돌릴 수/u,
      }),
    );
    await user.click(screen.getByRole("button", { name: "구분 바로 반영" }));

    expect(apply).toHaveBeenCalledWith({
      groups: [
        {
          nickname: "power-drive",
          candidateIds: manyCandidates.slice(0, 6).map(({ id }) => id),
        },
        {
          nickname: "loop-drive-champion",
          candidateIds: manyCandidates.slice(6).map(({ id }) => id),
        },
      ],
      editorId,
      note: "public-record-comparison",
    });
  }, 15_000);
});
