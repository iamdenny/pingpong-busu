import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { homonymNicknameSuggestions, type PlayerSummary } from "@busu/domain";
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
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <IdentityClaimDialog candidates={inputCandidates} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("IdentityClaimDialog", () => {
  it("requires a custom alias while defaulting a single candidate to its sole group", async () => {
    window.localStorage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, editorId);
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const apply = vi
      .spyOn(playerRepository, "applyIdentityEdit")
      .mockResolvedValue({
        accepted: true,
        referenceId: "SINGLE01",
        operationId: "00000000-0000-4000-8000-000000000004",
        status: "applied",
        groupCount: 1,
      });
    const user = userEvent.setup();
    renderDialog([candidates[0]!]);

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );

    const nicknameInput = screen.getByRole("textbox", { name: "탁구 별칭" });
    expect(nicknameInput).toHaveValue("");
    expect(nicknameInput).toHaveAttribute("placeholder", "예: 용인 치키타");
    await user.type(nicknameInput, "용인 치키타");
    expect(
      within(
        screen.getByRole("group", { name: /서울.*스핀탁구클럽/u }),
      ).getByRole("radio", { name: "용인 치키타" }),
    ).toBeChecked();
    expect(screen.getByText(/분류 1건 · 전체 1건/u)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "사람 추가" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/내 기록이라면/u)).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /잘못된 경우 다른 참여자가 이 편집 전체를 되돌릴 수/u,
      }),
    );
    await user.click(screen.getByRole("button", { name: "선택한 기록 묶기" }));

    expect(apply).toHaveBeenCalledWith({
      groups: [
        {
          nickname: "용인 치키타",
          candidateIds: ["candidate-seoul"],
        },
      ],
      editorId,
    });
  });

  it("keeps the candidate list stable while an open edit session receives refreshed props", async () => {
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    const view = render(
      <QueryClientProvider client={queryClient}>
        <IdentityClaimDialog candidates={[candidates[0]!]} />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <IdentityClaimDialog candidates={candidates} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "나를 알아볼 별칭" })).toBeInTheDocument();
    expect(screen.queryByText(/부산.*블루라켓/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "사람 추가" })).not.toBeInTheDocument();
  });

  it("does not auto-assign multiple candidates", async () => {
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );

    expect(screen.getByText(/분류 0건 · 전체 2건/u)).toBeInTheDocument();
    expect(screen.getByText(/소속과 활동 지역/u)).toBeInTheDocument();
  });

  it("groups every candidate under one alias in a single action", async () => {
    window.localStorage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, editorId);
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const submit = vi
      .spyOn(playerRepository, "applyIdentityEdit")
      .mockResolvedValue({
        accepted: true,
        referenceId: "EF56AB78",
        operationId: "00000000-0000-4000-8000-000000000002",
        status: "applied",
        groupCount: 1,
      });
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    await user.click(
      screen.getByRole("button", { name: "전체 2건 한 사람으로" }),
    );

    expect(screen.getByText(/분류 2건 · 전체 2건/u)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "전체 2건 한 사람으로" }),
    ).toBeDisabled();
    expect(
      within(
        screen.getByRole("group", { name: /부산.*블루라켓/u }),
      ).getByRole("radio", { name: "파워 드라이브 전문가" }),
    ).toBeChecked();

    await user.click(
      screen.getByRole("checkbox", {
        name: /같은 이름 기록 2건을 모두 한 사람으로 묶습니다/u,
      }),
    );
    await user.click(screen.getByRole("button", { name: "선택한 기록 묶기" }));

    expect(
      await screen.findByRole("heading", {
        name: "별칭으로 기록을 묶었습니다.",
      }),
    ).toBeInTheDocument();
    expect(submit.mock.calls[0]?.[0]).toEqual({
      groups: [
        {
          nickname: "파워 드라이브 전문가",
          candidateIds: ["candidate-seoul", "candidate-busan"],
        },
      ],
      editorId,
    });
  });

  it("clears every assignment and restores the default confirmation", async () => {
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    expect(screen.getByRole("button", { name: "전체 해제" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "전체 2건 한 사람으로" }),
    );
    await user.click(screen.getByRole("button", { name: "전체 해제" }));

    expect(screen.getByText(/분류 0건 · 전체 2건/u)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /선택한 별칭과 기록 구분이 바로 반영되며/u,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: /서울.*스핀탁구클럽/u })).getByRole(
        "radio",
        { name: "모름" },
      ),
    ).toBeChecked();
  });

  it("starts a new classification with one randomized suggestion", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );

    expect(screen.getByRole("textbox", { name: "사람 1 별칭" })).toHaveValue(
      homonymNicknameSuggestions[
        Math.floor(homonymNicknameSuggestions.length * 0.5)
      ],
    );
    expect(
      screen.queryByRole("textbox", { name: "사람 2 별칭" }),
    ).not.toBeInTheDocument();
  });

  it("restores saved aliases and candidate assignments when reopened", async () => {
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const savedCandidates = [
      { ...candidates[0]!, homonymNickname: "용인 치키타" },
      { ...candidates[1]!, homonymNickname: "부산 스매시" },
    ];
    const user = userEvent.setup();
    renderDialog(savedCandidates);

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );

    expect(screen.getByRole("textbox", { name: "사람 1 별칭" })).toHaveValue(
      "용인 치키타",
    );
    expect(screen.getByRole("textbox", { name: "사람 2 별칭" })).toHaveValue(
      "부산 스매시",
    );
    expect(
      within(
        screen.getByRole("group", { name: /서울.*스핀탁구클럽/u }),
      ).getByRole("radio", { name: "용인 치키타" }),
    ).toBeChecked();
    expect(
      within(screen.getByRole("group", { name: /부산.*블루라켓/u })).getByRole(
        "radio",
        { name: "부산 스매시" },
      ),
    ).toBeChecked();
  });

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

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    expect(
      screen.getByRole("dialog", { name: "별칭으로 기록 묶기" }),
    ).toHaveAttribute("open");
    expect(
      await screen.findByText("제1회 서울 라켓배 탁구대회"),
    ).toBeInTheDocument();
    expect(screen.getByText("여자 개인단식 5~7부")).toBeInTheDocument();
    expect(
      screen.getByText(
        /본인 인증이나 실제 실력, 부수, 공식 등급을 뜻하지 않습니다/u,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /구분 근거/u }),
    ).not.toBeInTheDocument();

    const submitButton = screen.getByRole("button", {
      name: "선택한 기록 묶기",
    });
    fireEvent.submit(submitButton.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("한 사람 이상의 별칭");
    await user.click(screen.getByRole("button", { name: "사람 추가" }));

    const seoulCandidate = screen.getByRole("group", {
      name: /서울.*스핀탁구클럽/u,
    });
    const busanCandidate = screen.getByRole("group", {
      name: /부산.*블루라켓/u,
    });
    await user.click(
      within(seoulCandidate).getByRole("radio", {
        name: "파워 드라이브 전문가",
      }),
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
        name: "별칭으로 기록을 묶었습니다.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/AB12CD34/u)).toBeInTheDocument();
    expect(submit.mock.calls[0]?.[0]).toEqual({
      groups: [
        {
          nickname: "파워 드라이브 전문가",
          candidateIds: ["candidate-seoul"],
        },
        {
          nickname: "루프 드라이브 최강자",
          candidateIds: ["candidate-busan"],
        },
      ],
      editorId,
    });
  });

  it("lets participants enter an additional alias without a catalog", async () => {
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const user = userEvent.setup();
    renderDialog([
      ...candidates,
      {
        ...candidates[0]!,
        id: "candidate-incheon",
        region: "인천",
        club: "스매시탁구클럽",
      },
    ]);

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    await user.click(screen.getByRole("button", { name: "사람 추가" }));

    const nicknameInput = screen.getByRole("textbox", { name: "사람 2 별칭" });
    expect(nicknameInput).toHaveValue("루프 드라이브 최강자");
    await user.clear(nicknameInput);
    await user.type(nicknameInput, "치키타 요정");
    expect(
      screen.getByRole("button", {
        name: "사람 2 치키타 요정 삭제",
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

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    await user.click(screen.getByRole("button", { name: "사람 추가" }));
    for (const [index, candidate] of manyCandidates.entries()) {
      const candidateGroup = screen.getByRole("group", {
        name: new RegExp("· " + (candidate.club ?? "") + " ·"),
      });
      fireEvent.click(
        within(candidateGroup).getByRole("radio", {
          name: index < 6 ? "파워 드라이브 전문가" : "루프 드라이브 최강자",
        }),
      );
    }
    expect(screen.getByText(/분류 12건 · 전체 12건/u)).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /잘못된 경우 다른 참여자가 이 편집 전체를 되돌릴 수/u,
      }),
    );
    await user.click(screen.getByRole("button", { name: "선택한 기록 묶기" }));

    expect(apply).toHaveBeenCalledWith({
      groups: [
        {
          nickname: "파워 드라이브 전문가",
          candidateIds: manyCandidates.slice(0, 6).map(({ id }) => id),
        },
        {
          nickname: "루프 드라이브 최강자",
          candidateIds: manyCandidates.slice(6).map(({ id }) => id),
        },
      ],
      editorId,
    });
  }, 15_000);

  it("applies one custom alias without forcing a second person", async () => {
    window.localStorage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, editorId);
    vi.spyOn(
      playerRepository,
      "getIdentityCandidateEvidence",
    ).mockResolvedValue([]);
    const apply = vi
      .spyOn(playerRepository, "applyIdentityEdit")
      .mockResolvedValue({
        accepted: true,
        referenceId: "ONEALIAS",
        operationId: "00000000-0000-4000-8000-000000000003",
        status: "applied",
        groupCount: 1,
      });
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    const nicknameInput = screen.getByRole("textbox", { name: "사람 1 별칭" });
    await user.clear(nicknameInput);
    await user.type(nicknameInput, "용인 치키타");
    const seoulCandidate = screen.getByRole("group", {
      name: /서울.*스핀탁구클럽/u,
    });
    await user.click(
      within(seoulCandidate).getByRole("radio", { name: "용인 치키타" }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /잘못된 경우 다른 참여자가 이 편집 전체를 되돌릴 수/u,
      }),
    );
    await user.click(screen.getByRole("button", { name: "선택한 기록 묶기" }));

    expect(apply).toHaveBeenCalledWith({
      groups: [{ nickname: "용인 치키타", candidateIds: ["candidate-seoul"] }],
      editorId,
    });
  });

  it("retries recent evidence loading after a transient failure", async () => {
    const evidence = vi
      .spyOn(playerRepository, "getIdentityCandidateEvidence")
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce([
        {
          candidateId: "candidate-seoul",
          status: "loaded",
          records: [
            {
              id: "record-retry",
              tournament: "재조회 성공 대회",
              scale: "district",
              event: "개인단식 6부",
              sourceCode: "astree",
              sourceName: "애즈트리",
              sourceUrl: "https://example.com/retry",
              lastCheckedAt: "2026-08-13T00:00:00.000Z",
            },
          ],
        },
      ]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "별칭으로 기록 묶기" }),
    );
    expect(
      await screen.findAllByText("최근 출전 기록을 불러오지 못했습니다."),
    ).not.toHaveLength(0);
    await user.click(
      screen.getAllByRole("button", { name: "다시 불러오기" })[0]!,
    );

    expect(await screen.findByText("재조회 성공 대회")).toBeInTheDocument();
    expect(evidence).toHaveBeenCalledTimes(2);
  });
});
