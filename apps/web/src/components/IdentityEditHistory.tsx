import { History, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { homonymNicknameLabel } from "@busu/domain";
import type { RevertIdentityEditInput } from "../lib/repository";
import { getAnonymousEditorId } from "../lib/anonymousEditor";
import { playerRepository } from "../lib/runtime";

interface IdentityEditHistoryProps {
  normalizedName: string;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function IdentityEditHistory({
  normalizedName,
}: IdentityEditHistoryProps) {
  const queryClient = useQueryClient();
  const [revertOperationId, setRevertOperationId] = useState<string>();
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [revertedOperationId, setRevertedOperationId] = useState<string>();
  const history = useQuery({
    queryKey: ["identity-edit-history", normalizedName],
    queryFn: () => playerRepository.listIdentityEditHistory(normalizedName),
    enabled: normalizedName.length > 0,
    staleTime: 30_000,
  });
  const revertEdit = useMutation({
    mutationFn: (input: RevertIdentityEditInput) =>
      playerRepository.revertIdentityEdit(input),
    onSuccess: (response) => {
      setRevertedOperationId(response.operationId);
      setRevertOperationId(undefined);
      setReason("");
      setConfirmed(false);
      void queryClient.invalidateQueries({ queryKey: ["players"] });
      void queryClient.invalidateQueries({
        queryKey: ["identity-edit-history", normalizedName],
      });
    },
    onError: () => {
      setErrorMessage(
        "되돌리지 못했습니다. 더 최근 편집이 있다면 최신 편집부터 되돌려 주세요.",
      );
    },
  });

  const startRevert = (operationId: string) => {
    setRevertOperationId(operationId);
    setReason("");
    setWebsite("");
    setConfirmed(false);
    setErrorMessage(undefined);
    setRevertedOperationId(undefined);
  };

  const submitRevert = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!revertOperationId) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      setErrorMessage("되돌리는 근거를 10자 이상 입력해 주세요.");
      return;
    }
    if (!confirmed) {
      setErrorMessage("기록이 다시 분리된다는 안내를 확인해 주세요.");
      return;
    }
    let editorId: string;
    try {
      editorId = getAnonymousEditorId();
    } catch {
      setErrorMessage(
        "이 브라우저에서 익명 편집자 ID를 만들 수 없습니다. 브라우저를 업데이트한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    setErrorMessage(undefined);
    revertEdit.mutate({
      operationId: revertOperationId,
      editorId,
      reason: trimmedReason,
      ...(website ? { website } : {}),
    });
  };

  const entries = history.data ?? [];

  return (
    <section
      className="identity-edit-history"
      aria-labelledby="identity-edit-history-title"
    >
      <details>
        <summary>
          <span id="identity-edit-history-title">
            <History size={17} aria-hidden="true" /> 참여 편집 이력
          </span>
          <strong>
            {history.isPending ? "확인 중" : `${entries.length}건`}
          </strong>
        </summary>
        <div className="identity-edit-history__body">
          <p>
            동명이인 기록 구분은 즉시 반영됩니다. 별칭별 분류와 모든 변경은 공개
            이력으로 남고, 잘못된 편집은 누구나 근거를 남겨 되돌릴 수 있습니다.
          </p>
          {history.isError ? (
            <p className="field-error" role="alert">
              참여 편집 이력을 불러오지 못했습니다.
            </p>
          ) : entries.length === 0 ? (
            <p className="identity-edit-history__empty">
              아직 참여 편집 이력이 없습니다.
            </p>
          ) : (
            <ol>
              {entries.map((entry) => (
                <li key={entry.operationId}>
                  <div className="identity-edit-history__entry-heading">
                    <span
                      className={`identity-edit-status identity-edit-status--${entry.status}`}
                    >
                      {entry.status === "applied" ? "반영됨" : "되돌림"}
                    </span>
                    <strong>편집번호 {entry.referenceId}</strong>
                    <time dateTime={entry.createdAt}>
                      {dateFormatter.format(new Date(entry.createdAt))}
                    </time>
                  </div>
                  <p className="identity-edit-history__reason">
                    변경 근거: {entry.reason}
                  </p>
                  <ul className="identity-edit-history__candidates">
                    {entry.candidates.map((candidate) => (
                      <li key={candidate.playerId}>
                        <strong>{candidate.name}</strong>
                        {candidate.groupNickname && (
                          <b className="homonym-nickname-badge">
                            {homonymNicknameLabel(candidate.groupNickname)}
                          </b>
                        )}
                        <span>
                          {candidate.region ?? "지역 미상"} ·{" "}
                          {candidate.club ?? "소속 미상"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {entry.revertReason && (
                    <p className="identity-edit-history__revert-reason">
                      되돌린 근거: {entry.revertReason}
                    </p>
                  )}
                  {revertedOperationId === entry.operationId && (
                    <p className="identity-edit-history__success" role="status">
                      기록 연결을 되돌렸습니다.
                    </p>
                  )}
                  {entry.status === "applied" && entry.canRevert && (
                    <button
                      type="button"
                      className="identity-edit-history__revert-button"
                      aria-expanded={revertOperationId === entry.operationId}
                      onClick={() => startRevert(entry.operationId)}
                    >
                      <RotateCcw size={15} aria-hidden="true" /> 되돌리기
                    </button>
                  )}
                  {entry.status === "applied" && !entry.canRevert && (
                    <small>더 최근 편집을 먼저 되돌려야 합니다.</small>
                  )}
                  {revertOperationId === entry.operationId && (
                    <form onSubmit={submitRevert}>
                      <p>
                        이 편집에서 나눈 별칭과 기록 연결을 모두 이전 상태로
                        되돌립니다.
                      </p>
                      <label
                        htmlFor={`identity-revert-reason-${entry.operationId}`}
                      >
                        되돌리는 근거
                      </label>
                      <textarea
                        id={`identity-revert-reason-${entry.operationId}`}
                        name="reason"
                        minLength={10}
                        maxLength={500}
                        required
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setErrorMessage(undefined);
                        }}
                      />
                      <p className="identity-editor-note">
                        비밀번호나 이전 편집 코드는 필요하지 않습니다. 되돌린
                        근거와 결과도 공개 이력에 남습니다.
                      </p>
                      <div className="identity-claim-honeypot" inert>
                        <label
                          htmlFor={`identity-revert-website-${entry.operationId}`}
                        >
                          웹사이트
                        </label>
                        <input
                          id={`identity-revert-website-${entry.operationId}`}
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
                          이 편집에서 적용된 모든 별칭과 기록 구분이 이전 상태로
                          돌아감을 확인했습니다.
                        </span>
                      </label>
                      {errorMessage && (
                        <p className="field-error" role="alert">
                          {errorMessage}
                        </p>
                      )}
                      <div className="identity-edit-history__form-actions">
                        <button
                          type="button"
                          onClick={() => setRevertOperationId(undefined)}
                        >
                          취소
                        </button>
                        <button type="submit" disabled={revertEdit.isPending}>
                          {revertEdit.isPending
                            ? "되돌리는 중…"
                            : "기록 분리 실행"}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>
    </section>
  );
}
