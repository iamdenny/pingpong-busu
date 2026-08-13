import { Plus, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  formatDivisionObservation,
  homonymNicknameCatalog,
  homonymNicknameLabel,
  type HomonymNicknameCode,
  type PlayerSummary,
} from "@busu/domain";
import { getAnonymousEditorId } from "../lib/anonymousEditor";
import { playerRepository } from "../lib/runtime";

interface IdentityClaimDialogProps {
  candidates: readonly PlayerSummary[];
}

interface IdentityGroup {
  id: string;
  nickname: HomonymNicknameCode;
}

const evidenceDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const desktopDialogCloseDurationMs = 180;
const mobileDialogCloseDurationMs = 220;

function initialGroups(): IdentityGroup[] {
  return [
    { id: "identity-group-1", nickname: "power-drive" },
    { id: "identity-group-2", nickname: "loop-drive-champion" },
  ];
}

export function IdentityClaimDialog({ candidates }: IdentityClaimDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextGroupIdRef = useRef(3);
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<IdentityGroup[]>(initialGroups);
  const [assignmentByCandidate, setAssignmentByCandidate] = useState<
    Readonly<Record<string, string>>
  >({});
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [submissionState, setSubmissionState] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [referenceId, setReferenceId] = useState<string>();
  const [appliedGroupCount, setAppliedGroupCount] = useState<number>();
  const [isOpen, setIsOpen] = useState(false);
  const [dialogState, setDialogState] = useState<"closed" | "open" | "closing">(
    "closed",
  );
  const closeTimerRef = useRef<number | undefined>(undefined);
  const isClosingRef = useRef(false);
  const candidateIds = useMemo(
    () => candidates.map((candidate) => candidate.id),
    [candidates],
  );
  const evidence = useQuery({
    queryKey: ["identity-candidate-evidence", candidateIds],
    queryFn: () => playerRepository.getIdentityCandidateEvidence(candidateIds),
    enabled: isOpen && candidateIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const evidenceByCandidate = new Map(
    evidence.data?.map((item) => [item.candidateId, item.records] as const),
  );
  const usedNicknameCodes = new Set(groups.map((group) => group.nickname));
  const assignedCount = Object.values(assignmentByCandidate).filter(
    Boolean,
  ).length;

  const open = () => {
    isClosingRef.current = false;
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    setErrorMessage(undefined);
    setSubmissionState("idle");
    setReferenceId(undefined);
    setAppliedGroupCount(undefined);
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
    setGroups(initialGroups());
    nextGroupIdRef.current = 3;
    setAssignmentByCandidate({});
    setNote("");
    setWebsite("");
    setConfirmed(false);
    setErrorMessage(undefined);
    setSubmissionState("idle");
    setReferenceId(undefined);
    setAppliedGroupCount(undefined);
  };

  const assignCandidate = (candidateId: string, groupId: string) => {
    setAssignmentByCandidate((current) => {
      if (!groupId) {
        const next = { ...current };
        delete next[candidateId];
        return next;
      }
      return { ...current, [candidateId]: groupId };
    });
    setErrorMessage(undefined);
  };

  const updateGroupNickname = (
    groupId: string,
    nickname: HomonymNicknameCode,
  ) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, nickname } : group,
      ),
    );
    setErrorMessage(undefined);
  };

  const addGroup = () => {
    setGroups((current) => {
      const currentNicknames = new Set(current.map((group) => group.nickname));
      const nickname = homonymNicknameCatalog.find(
        (item) => !currentNicknames.has(item.code),
      )?.code;
      if (!nickname) return current;
      const groupId = "identity-group-" + nextGroupIdRef.current;
      nextGroupIdRef.current += 1;
      return [...current, { id: groupId, nickname }];
    });
    setErrorMessage(undefined);
  };

  const removeGroup = (groupId: string) => {
    if (groups.length <= 2) return;
    setGroups((current) => current.filter((group) => group.id !== groupId));
    setAssignmentByCandidate((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, value]) => value !== groupId),
      ),
    );
    setErrorMessage(undefined);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const assignedGroups = groups.flatMap((group) => {
      const groupCandidateIds = candidateIds.filter(
        (candidateId) => assignmentByCandidate[candidateId] === group.id,
      );
      return groupCandidateIds.length > 0
        ? [{ nickname: group.nickname, candidateIds: groupCandidateIds }]
        : [];
    });
    if (assignedGroups.length < 2) {
      setErrorMessage("서로 다른 사람 별칭 두 개 이상에 기록을 배정해 주세요.");
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
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(website ? { website } : {}),
    });
    void request
      .then((response) => {
        setReferenceId(response.referenceId);
        setAppliedGroupCount(response.groupCount);
        setSubmissionState("success");
      })
      .catch(() => setSubmissionState("error"));
  };

  return (
    <>
      <button className="identity-claim-trigger" type="button" onClick={open}>
        <UsersRound size={17} aria-hidden="true" /> 동명이인 구분하기
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
            <h2 id="identity-claim-title">동명이인 기록 구분하기</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label="동명이인 기록 구분하기 닫기"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        {submissionState === "success" ? (
          <div className="identity-claim-success" role="status">
            <ShieldCheck aria-hidden="true" />
            <h3>동명이인 기록을 구분했습니다.</h3>
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
              같은 이름의 각 사람에게 기억하기 쉬운 탁구 별칭을 붙이고, 해당하는
              공개 대회 기록을 나눠 주세요. 별칭은 재미있는 구분자일 뿐 실제
              실력이나 공식 등급을 뜻하지 않습니다.
            </p>

            <section
              className="identity-groups"
              aria-labelledby="identity-groups-title"
            >
              <div className="identity-groups__heading">
                <div>
                  <h3 id="identity-groups-title">사람별 탁구 별칭</h3>
                  <p>같은 이름 안에서는 서로 다른 별칭을 사용합니다.</p>
                </div>
                <button
                  type="button"
                  onClick={addGroup}
                  disabled={groups.length >= homonymNicknameCatalog.length}
                >
                  <Plus size={15} aria-hidden="true" /> 사람 추가
                </button>
              </div>
              <ol>
                {groups.map((group, index) => {
                  const groupCandidateCount = Object.values(
                    assignmentByCandidate,
                  ).filter((value) => value === group.id).length;
                  return (
                    <li key={group.id}>
                      <label htmlFor={group.id + "-nickname"}>
                        사람 {index + 1} 별칭
                      </label>
                      <select
                        id={group.id + "-nickname"}
                        value={group.nickname}
                        onChange={(event) =>
                          updateGroupNickname(
                            group.id,
                            event.target.value as HomonymNicknameCode,
                          )
                        }
                      >
                        {homonymNicknameCatalog.map((item) => (
                          <option
                            key={item.code}
                            value={item.code}
                            disabled={
                              item.code !== group.nickname &&
                              usedNicknameCodes.has(item.code)
                            }
                          >
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <strong>{groupCandidateCount}건</strong>
                      {groups.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeGroup(group.id)}
                          aria-label={
                            "사람 " +
                            (index + 1) +
                            " " +
                            homonymNicknameLabel(group.nickname) +
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
              <legend>기록을 사람별로 나누기</legend>
              <p id="identity-candidate-hint">
                후보 수 제한은 없습니다. 확실하지 않은 기록은 미분류로 남겨도
                됩니다. 분류 {assignedCount}건 · 전체 {candidates.length}건
              </p>
              {candidates.map((candidate) => {
                const evidenceId =
                  "identity-candidate-evidence-" + candidate.id;
                const records = evidenceByCandidate.get(candidate.id) ?? [];
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
                            <span>{homonymNicknameLabel(group.nickname)}</span>
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
                          <span>아직 모르겠어요</span>
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
                          <option value="">아직 모르겠어요</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {homonymNicknameLabel(group.nickname)}
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
                      ) : evidence.isError ? (
                        <small>최근 출전 기록을 불러오지 못했습니다.</small>
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

            <div className="identity-claim-field">
              <label htmlFor="identity-claim-note">
                구분 근거 <small>(선택)</small>
              </label>
              <p id="identity-claim-note-hint">
                대회·종목·소속처럼 구분에 도움이 되는 내용만 적어 주세요. 공개
                이력에 표시되므로 연락처 등 개인정보는 적지 마세요.
              </p>
              <textarea
                id="identity-claim-note"
                name="note"
                minLength={10}
                maxLength={500}
                aria-describedby="identity-claim-note-hint"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

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
                {submissionState === "pending" ? "반영 중…" : "구분 바로 반영"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
