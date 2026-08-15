import { Plus, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  formatDivisionObservation,
  homonymNicknameMaxLength,
  homonymNicknameLabel,
  isHomonymNickname,
  normalizeHomonymNickname,
  pickHomonymNicknameSuggestion,
  type PlayerSummary,
} from "@busu/domain";
import { getAnonymousEditorId } from "../lib/anonymousEditor";
import { playerRepository } from "../lib/runtime";

interface IdentityClaimDialogProps {
  candidates: readonly PlayerSummary[];
}

interface IdentityGroup {
  id: string;
  nickname: string;
}

interface IdentityFormState {
  groups: IdentityGroup[];
  assignments: Readonly<Record<string, string>>;
}

const evidenceDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const desktopDialogCloseDurationMs = 180;
const mobileDialogCloseDurationMs = 220;

function identityFormState(
  candidates: readonly PlayerSummary[],
): IdentityFormState {
  const groups: IdentityGroup[] = [];
  const assignments: Record<string, string> = {};
  const groupIdByNickname = new Map<string, string>();

  for (const candidate of candidates) {
    const nickname = homonymNicknameLabel(candidate.homonymNickname);
    if (!nickname) continue;
    const nicknameKey = nickname.toLocaleLowerCase("ko-KR");
    let groupId = groupIdByNickname.get(nicknameKey);
    if (!groupId) {
      groupId = "identity-group-" + (groups.length + 1);
      groups.push({ id: groupId, nickname });
      groupIdByNickname.set(nicknameKey, groupId);
    }
    assignments[candidate.id] = groupId;
  }

  if (groups.length === 0) {
    groups.push({
      id: "identity-group-1",
      nickname:
        candidates.length === 1 ? "" : pickHomonymNicknameSuggestion(),
    });
    if (candidates.length === 1 && candidates[0]) {
      assignments[candidates[0].id] = "identity-group-1";
    }
  }

  return { groups, assignments };
}

export function IdentityClaimDialog({ candidates }: IdentityClaimDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextGroupIdRef = useRef(2);
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<IdentityFormState>(() =>
    identityFormState(candidates),
  );
  const { groups, assignments: assignmentByCandidate } = formState;
  const [website, setWebsite] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [submissionState, setSubmissionState] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [referenceId, setReferenceId] = useState<string>();
  const [appliedGroupCount, setAppliedGroupCount] = useState<number>();
  const [isOpen, setIsOpen] = useState(false);
  const [activeCandidates, setActiveCandidates] = useState(candidates);
  const dialogCandidates = isOpen ? activeCandidates : candidates;
  const isSingleCandidate = dialogCandidates.length === 1;
  const [dialogState, setDialogState] = useState<"closed" | "open" | "closing">(
    "closed",
  );
  const closeTimerRef = useRef<number | undefined>(undefined);
  const isClosingRef = useRef(false);
  const candidateIds = useMemo(
    () => dialogCandidates.map((candidate) => candidate.id),
    [dialogCandidates],
  );
  const evidence = useQuery({
    queryKey: ["identity-candidate-evidence", candidateIds],
    queryFn: () => playerRepository.getIdentityCandidateEvidence(candidateIds),
    enabled: isOpen && candidateIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const evidenceByCandidate = new Map(
    evidence.data?.map((item) => [item.candidateId, item] as const),
  );
  const assignedCount = Object.values(assignmentByCandidate).filter(
    Boolean,
  ).length;

  const open = () => {
    const restoredFormState = identityFormState(candidates);
    setActiveCandidates(candidates);
    isClosingRef.current = false;
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    setErrorMessage(undefined);
    setSubmissionState("idle");
    setReferenceId(undefined);
    setAppliedGroupCount(undefined);
    setFormState(restoredFormState);
    nextGroupIdRef.current = restoredFormState.groups.length + 1;
    setIsOpen(true);
    setDialogState("open");
    dialogRef.current?.showModal();
  };

  const finishClose = () => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    isClosingRef.current = false;
    dialogRef.current?.close();
  };

  const close = () => {
    if (!dialogRef.current?.open || isClosingRef.current) return;
    isClosingRef.current = true;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      finishClose();
      return;
    }
    setDialogState("closing");
    const closeDuration =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 700px)").matches
        ? mobileDialogCloseDurationMs
        : desktopDialogCloseDurationMs;
    closeTimerRef.current = window.setTimeout(finishClose, closeDuration);
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current !== undefined)
        window.clearTimeout(closeTimerRef.current);
      isClosingRef.current = false;
    },
    [],
  );

  const resetForm = () => {
    isClosingRef.current = false;
    setDialogState("closed");
    if (submissionState === "success") {
      void queryClient.invalidateQueries({ queryKey: ["players"] });
      void queryClient.invalidateQueries({
        queryKey: ["identity-edit-history"],
      });
    }
    setIsOpen(false);
    setWebsite("");
    setConfirmed(false);
    setErrorMessage(undefined);
    setSubmissionState("idle");
    setReferenceId(undefined);
    setAppliedGroupCount(undefined);
  };

  const assignCandidate = (candidateId: string, groupId: string) => {
    setFormState((current) => {
      const assignments = { ...current.assignments };
      if (!groupId) {
        delete assignments[candidateId];
      } else {
        assignments[candidateId] = groupId;
      }
      return { ...current, assignments };
    });
    setErrorMessage(undefined);
  };

  const updateGroupNickname = (groupId: string, nickname: string) => {
    setFormState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, nickname } : group,
      ),
    }));
    setErrorMessage(undefined);
  };

  const addGroup = () => {
    setFormState((current) => {
      const groupId = "identity-group-" + nextGroupIdRef.current;
      nextGroupIdRef.current += 1;
      const suggestedNickname = pickHomonymNicknameSuggestion(
        current.groups.map((group) => group.nickname),
      );
      return {
        ...current,
        groups: [
          ...current.groups,
          { id: groupId, nickname: suggestedNickname },
        ],
      };
    });
    setErrorMessage(undefined);
  };

  const removeGroup = (groupId: string) => {
    if (groups.length <= 1) return;
    setFormState((current) => ({
      groups: current.groups.filter((group) => group.id !== groupId),
      assignments: Object.fromEntries(
        Object.entries(current.assignments).filter(
          ([, value]) => value !== groupId,
        ),
      ),
    }));
    setErrorMessage(undefined);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const assignedGroups = groups.flatMap((group) => {
      const groupCandidateIds = candidateIds.filter(
        (candidateId) => assignmentByCandidate[candidateId] === group.id,
      );
      const nickname = normalizeHomonymNickname(group.nickname);
      return groupCandidateIds.length > 0
        ? [{ nickname, candidateIds: groupCandidateIds }]
        : [];
    });
    if (assignedGroups.some((group) => !isHomonymNickname(group.nickname))) {
      setErrorMessage(
        `별칭은 한글이나 영문을 포함한 2~${homonymNicknameMaxLength}자로 입력해 주세요.`,
      );
      return;
    }
    if (
      new Set(
        assignedGroups.map((group) =>
          group.nickname.toLocaleLowerCase("ko-KR"),
        ),
      ).size !== assignedGroups.length
    ) {
      setErrorMessage("각 사람에게 서로 다른 별칭을 입력해 주세요.");
      return;
    }
    if (assignedGroups.length < 1) {
      setErrorMessage("한 사람 이상의 별칭에 기록을 배정해 주세요.");
      return;
    }
    if (!confirmed) {
      setErrorMessage("즉시 반영과 공개 편집 이력 안내를 확인해 주세요.");
      return;
    }
    setErrorMessage(undefined);
    setSubmissionState("pending");
    let editorId: string;
    try {
      editorId = getAnonymousEditorId();
    } catch {
      setSubmissionState("error");
      setErrorMessage(
        "이 브라우저에서 익명 편집자 ID를 만들 수 없습니다. 브라우저를 업데이트한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    const request = playerRepository.applyIdentityEdit({
      groups: assignedGroups,
      editorId,
      ...(website ? { website } : {}),
    });
    void request
      .then(async (response) => {
        setReferenceId(response.referenceId);
        setAppliedGroupCount(response.groupCount);
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({
            queryKey: ["identity-edit-history"],
          }),
        ]);
        setSubmissionState("success");
      })
      .catch((error: unknown) => {
        setSubmissionState("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "편집을 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      });
  };

  return (
    <>
      <button className="identity-claim-trigger" type="button" onClick={open}>
        <UsersRound size={17} aria-hidden="true" /> 별칭으로 기록 묶기
      </button>
      <dialog
        className="identity-claim-dialog"
        ref={dialogRef}
        data-state={dialogState}
        aria-labelledby="identity-claim-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={resetForm}
      >
        <div className="identity-claim-dialog__header">
          <div>
            <p className="eyebrow">공개 참여 편집</p>
            <h2 id="identity-claim-title">별칭으로 기록 묶기</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label="별칭으로 기록 묶기 닫기"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        {submissionState === "success" ? (
          <div className="identity-claim-success" role="status">
            <ShieldCheck aria-hidden="true" />
            <h3>별칭으로 기록을 묶었습니다.</h3>
            <p>
              편집번호 <strong>{referenceId}</strong> · 기록을{" "}
              <strong>{appliedGroupCount}개 별칭</strong>으로 나눴습니다. 잘못
              나눴다면 참여 편집 이력에서 누구나 전체 편집을 되돌릴 수 있습니다.
            </p>
            <button type="button" onClick={close}>
              결과 새로고침
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="identity-claim-dialog__intro">
              {isSingleCandidate
                ? "내 기록이라면 알아보기 쉬운 탁구 별칭을 붙여 한곳에 모아 보세요. "
                : "내 기록이라면 소속과 활동 지역을 확인하고, 같은 이름의 각 사람에게 기억하기 쉬운 탁구 별칭을 붙여 주세요. "}
              별칭은 공개 기록을 구분하는 이름일 뿐 본인 인증이나 실제 실력,
              부수, 공식 등급을 뜻하지 않습니다.
            </p>

            <section
              className="identity-groups"
              aria-labelledby="identity-groups-title"
            >
              <div className="identity-groups__heading">
                <div>
                  <h3 id="identity-groups-title">
                    {isSingleCandidate
                      ? "나를 알아볼 별칭"
                      : "사람별 탁구 별칭"}
                  </h3>
                  <p>추천 문구를 바꾸거나 원하는 별칭을 직접 입력하세요.</p>
                </div>
                {!isSingleCandidate && (
                  <button
                    type="button"
                    onClick={addGroup}
                    disabled={groups.length >= candidates.length}
                  >
                    <Plus size={15} aria-hidden="true" /> 사람 추가
                  </button>
                )}
              </div>
              <ol>
                {groups.map((group, index) => {
                  const groupCandidateCount = Object.values(
                    assignmentByCandidate,
                  ).filter((value) => value === group.id).length;
                  return (
                    <li key={group.id}>
                      <label htmlFor={group.id + "-nickname"}>
                        {isSingleCandidate
                          ? "탁구 별칭"
                          : `사람 ${index + 1} 별칭`}
                      </label>
                      <input
                        id={group.id + "-nickname"}
                        name={group.id + "-nickname"}
                        type="text"
                        autoComplete="off"
                        minLength={2}
                        maxLength={homonymNicknameMaxLength}
                        required
                        placeholder={isSingleCandidate ? "예: 용인 치키타" : undefined}
                        value={group.nickname}
                        onChange={(event) =>
                          updateGroupNickname(group.id, event.target.value)
                        }
                      />
                      <strong>{groupCandidateCount}건</strong>
                      {groups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeGroup(group.id)}
                          aria-label={
                            "사람 " +
                            (index + 1) +
                            " " +
                            (homonymNicknameLabel(group.nickname) ||
                              "별칭 미입력") +
                            " 삭제"
                          }
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            <fieldset
              className="identity-candidate-options"
              aria-describedby="identity-candidate-hint"
            >
              <legend>
                {isSingleCandidate
                  ? "별칭에 연결할 기록"
                  : "기록을 사람별로 나누기"}
              </legend>
              <p id="identity-candidate-hint">
                {isSingleCandidate
                  ? "표시된 공개 기록이 내 기록이 아니라면 모름을 선택할 수 있습니다. "
                  : "후보 수 제한은 없습니다. 확실하지 않은 기록은 미분류로 남겨도 됩니다. "}
                분류 {assignedCount}건 · 전체 {candidates.length}건
              </p>
              {dialogCandidates.map((candidate) => {
                const evidenceId =
                  "identity-candidate-evidence-" + candidate.id;
                const candidateEvidence = evidenceByCandidate.get(candidate.id);
                const records = candidateEvidence?.records ?? [];
                const selectedGroupId =
                  assignmentByCandidate[candidate.id] ?? "";
                return (
                  <fieldset
                    className="identity-candidate-option"
                    key={candidate.id}
                    aria-describedby={evidenceId}
                  >
                    <legend>
                      <strong>{candidate.name}</strong>
                      <small>
                        {candidate.region ?? "지역 미상"} ·{" "}
                        {candidate.club ?? "소속 미상"} ·{" "}
                        {formatDivisionObservation(
                          candidate.recentObservedDivisionSystem,
                          candidate.recentObservedDivision,
                        )}{" "}
                        · 입상 {candidate.resultCount}건
                      </small>
                    </legend>
                    {groups.length <= 5 ? (
                      <div className="identity-assignment-radios">
                        {groups.map((group) => (
                          <label key={group.id}>
                            <input
                              type="radio"
                              name={"identity-candidate-" + candidate.id}
                              value={group.id}
                              checked={selectedGroupId === group.id}
                              onChange={() =>
                                assignCandidate(candidate.id, group.id)
                              }
                            />
                            <span>
                              {homonymNicknameLabel(group.nickname) ||
                                `사람 ${groups.indexOf(group) + 1}`}
                            </span>
                          </label>
                        ))}
                        <label>
                          <input
                            type="radio"
                            name={"identity-candidate-" + candidate.id}
                            value=""
                            checked={!selectedGroupId}
                            onChange={() => assignCandidate(candidate.id, "")}
                          />
                          <span>모름</span>
                        </label>
                      </div>
                    ) : (
                      <label className="identity-assignment-select">
                        <span>이 기록의 사람 별칭</span>
                        <select
                          value={selectedGroupId}
                          onChange={(event) =>
                            assignCandidate(candidate.id, event.target.value)
                          }
                        >
                          <option value="">모름</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {homonymNicknameLabel(group.nickname) ||
                                `사람 ${groups.indexOf(group) + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div
                      className="identity-candidate-evidence"
                      id={evidenceId}
                    >
                      {evidence.isPending ? (
                        <small>최근 출전 기록 확인 중…</small>
                      ) : evidence.isError ||
                        candidateEvidence?.status === "error" ? (
                        <div className="identity-candidate-evidence__error">
                          <small>
                            {candidateEvidence?.status === "error"
                              ? "이 후보의 최근 출전 기록 조회에 실패했습니다."
                              : "최근 출전 기록을 불러오지 못했습니다."}
                          </small>
                          <button
                            type="button"
                            onClick={() => void evidence.refetch()}
                            disabled={evidence.isFetching}
                          >
                            다시 불러오기
                          </button>
                        </div>
                      ) : records.length === 0 ? (
                        <small>확인 가능한 출전 기록이 없습니다.</small>
                      ) : (
                        <>
                          <small className="identity-candidate-evidence__title">
                            최근 출전 기록
                          </small>
                          <ul>
                            {records.map((record) => (
                              <li key={record.id}>
                                <span>
                                  {record.date && (
                                    <time dateTime={record.date}>
                                      {evidenceDateFormatter.format(
                                        new Date(record.date + "T00:00:00"),
                                      )}
                                    </time>
                                  )}
                                  <strong>{record.tournament}</strong>
                                </span>
                                <span>{record.event}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </fieldset>
                );
              })}
            </fieldset>

            <p className="identity-editor-note">
              별도의 비밀번호는 없습니다. 원본 기록은 삭제되지 않고, 변경과
              되돌리기는 모두 공개 이력으로 남습니다.
            </p>

            <div className="identity-claim-honeypot" inert>
              <label htmlFor="identity-claim-website">웹사이트</label>
              <input
                id="identity-claim-website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>

            <label className="identity-claim-confirmation">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(event) => {
                  setConfirmed(event.target.checked);
                  setErrorMessage(undefined);
                }}
              />
              <span>
                선택한 별칭과 기록 구분이 바로 반영되며, 잘못된 경우 다른
                참여자가 이 편집 전체를 되돌릴 수 있음을 확인했습니다.
              </span>
            </label>

            {(errorMessage || submissionState === "error") && (
              <p className="field-error" role="alert">
                {errorMessage ??
                  "편집을 반영하지 못했습니다. 최신 검색 결과를 확인한 뒤 다시 시도해 주세요."}
              </p>
            )}

            <div className="identity-claim-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={close}
              >
                취소
              </button>
              <button type="submit" disabled={submissionState === "pending"}>
                {submissionState === "pending"
                  ? "반영 중…"
                  : "선택한 기록 묶기"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
