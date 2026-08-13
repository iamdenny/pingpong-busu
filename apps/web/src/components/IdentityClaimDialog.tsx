import { ShieldCheck, UsersRound, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { formatDivisionObservation, type PlayerSummary } from "@busu/domain";
import { playerRepository } from "../lib/runtime";

interface IdentityClaimDialogProps {
  candidates: readonly PlayerSummary[];
}

const privateCodePattern = /^\d{4}$/u;
const evidenceDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function IdentityClaimDialog({ candidates }: IdentityClaimDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [privateCode, setPrivateCode] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [submissionState, setSubmissionState] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [referenceId, setReferenceId] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const evidence = useQuery({
    queryKey: ["identity-candidate-evidence", candidateIds],
    queryFn: () => playerRepository.getIdentityCandidateEvidence(candidateIds),
    enabled: isOpen && candidateIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const evidenceByCandidate = new Map(
    evidence.data?.map((item) => [item.candidateId, item.records] as const),
  );

  const open = () => {
    setErrorMessage(undefined);
    setSubmissionState("idle");
    setReferenceId(undefined);
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const resetForm = () => {
    setIsOpen(false);
    setSelectedIds(new Set());
    setPrivateCode("");
    setNote("");
    setWebsite("");
    setConfirmed(false);
    setErrorMessage(undefined);
    setSubmissionState("idle");
    setReferenceId(undefined);
  };

  const toggleCandidate = (id: string) => {
    if (!selectedIds.has(id) && selectedIds.size >= 10) {
      setErrorMessage("한 번에 최대 10개 후보를 선택할 수 있습니다.");
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErrorMessage(undefined);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIds.size === 0) {
      setErrorMessage("내 기록에 해당하는 후보를 한 명 이상 선택해 주세요.");
      return;
    }
    if (!privateCodePattern.test(privateCode)) {
      setErrorMessage("본인 구분 코드 숫자 4자리를 입력해 주세요.");
      return;
    }
    if (!confirmed) {
      setErrorMessage("비공개 저장과 관리자 검토 안내를 확인해 주세요.");
      return;
    }
    setErrorMessage(undefined);
    setSubmissionState("pending");
    const request = playerRepository.submitIdentityClaim({
      candidateIds: [...selectedIds],
      privateCode,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(website ? { website } : {}),
    });
    setPrivateCode("");
    void request
      .then((response) => {
        setReferenceId(response.referenceId);
        setSubmissionState("success");
      })
      .catch(() => setSubmissionState("error"));
  };

  return (
    <>
      <button className="identity-claim-trigger" type="button" onClick={open}>
        <UsersRound size={17} aria-hidden="true" /> 내 기록 구분 돕기
      </button>
      <dialog
        className="identity-claim-dialog"
        ref={dialogRef}
        aria-labelledby="identity-claim-title"
        onClose={resetForm}
      >
        <div className="identity-claim-dialog__header">
          <div>
            <p className="eyebrow">참여자 제보</p>
            <h2 id="identity-claim-title">동명이인 구분 제보</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label="동명이인 구분 제보 닫기"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        {submissionState === "success" ? (
          <div className="identity-claim-success" role="status">
            <ShieldCheck aria-hidden="true" />
            <h3>제보가 접수됐습니다.</h3>
            <p>
              접수번호 <strong>{referenceId}</strong> · 관리자 검토 전에는
              후보를 합치거나 표시를 변경하지 않습니다.
            </p>
            <button type="button" onClick={close}>
              확인
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="identity-claim-dialog__intro">
              아래에서 내 기록을 모두 선택하고 본인만 기억할 숫자 4자리를 정해
              주세요. 코드는 화면에 공개되지 않고, 서버에서 복원할 수 없는
              확인값으로 바꿔 저장합니다.
            </p>
            <fieldset
              className="identity-candidate-options"
              aria-describedby="identity-candidate-hint"
            >
              <legend>내 기록 후보</legend>
              <p id="identity-candidate-hint">
                같은 사람의 기록이면 여러 개를 선택할 수 있습니다.
              </p>
              {candidates.map((candidate) => {
                const evidenceId = `identity-candidate-evidence-${candidate.id}`;
                const records = evidenceByCandidate.get(candidate.id) ?? [];
                return (
                  <div className="identity-candidate-option" key={candidate.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(candidate.id)}
                        aria-describedby={evidenceId}
                        onChange={() => toggleCandidate(candidate.id)}
                      />
                      <span>
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
                      </span>
                    </label>
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
                                        new Date(`${record.date}T00:00:00`),
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
                  </div>
                );
              })}
            </fieldset>

            <div className="identity-claim-field">
              <label htmlFor="identity-private-code">
                본인 구분 코드 4자리
              </label>
              <p id="identity-private-code-hint">
                휴대폰 번호나 생년월일은 사용하지 마세요. 제출 후 원문 숫자는
                저장하지 않습니다.
              </p>
              <input
                id="identity-private-code"
                name="privateCode"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                enterKeyHint="done"
                required
                aria-describedby="identity-private-code-hint"
                value={privateCode}
                onChange={(event) => {
                  setPrivateCode(
                    event.target.value.replace(/\D/gu, "").slice(0, 4),
                  );
                  setErrorMessage(undefined);
                }}
              />
            </div>

            <div className="identity-claim-field">
              <label htmlFor="identity-claim-note">
                관리자 참고사항 <small>(선택)</small>
              </label>
              <p id="identity-claim-note-hint">
                소속 변경이나 활동 지역처럼 구분에 도움이 되는 내용만 적어
                주세요. 연락처는 적지 마세요.
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
                구분 코드 원문은 저장되지 않으며, 관리자 검토 전 자동으로 후보가
                합쳐지지 않음을 확인했습니다.
              </span>
            </label>

            {(errorMessage || submissionState === "error") && (
              <p className="field-error" role="alert">
                {errorMessage ??
                  "제보를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."}
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
                {submissionState === "pending" ? "접수 중…" : "검토 요청"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
