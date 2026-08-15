import { ExternalLink, MessageCircle, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { trackAnalyticsEvent } from "../lib/analytics";
import type {
  FeedbackCategory,
  FeedbackRepository,
  FeedbackSubmissionInput,
} from "../lib/feedback-repository";
import { FeedbackSubmissionError } from "../lib/feedback-repository";

interface FeedbackDialogProps {
  repository: FeedbackRepository;
  appVersion: string;
}

const categoryLabels: Record<FeedbackCategory, string> = {
  inquiry: "일반 문의",
  data_correction: "기록 정정",
  bug: "오류 제보",
  feature: "기능 제안",
};

const errorMessages = {
  validation: "입력 내용을 확인해 주세요.",
  sensitive_content:
    "민감한 개인정보가 포함된 것 같습니다. 내용을 제거한 뒤 다시 보내 주세요.",
  rate_limit: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  unavailable: "현재 제보를 접수할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  retryable:
    "처리 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
  conflict: "브라우저 환경이 변경되었습니다. 다시 보내 주세요.",
  unknown: "제보를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

function feedbackErrorCode(error: unknown): keyof typeof errorMessages {
  const code =
    error instanceof FeedbackSubmissionError
      ? error.code
      : typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
        ? error.code
        : undefined;
  return code && Object.hasOwn(errorMessages, code)
    ? (code as keyof typeof errorMessages)
    : "unknown";
}

function collectSubmission(
  submissionId: string,
  category: FeedbackCategory,
  message: string,
  website: string,
  appVersion: string,
): FeedbackSubmissionInput {
  return {
    submissionId,
    category,
    message: message.trim(),
    website,
    currentUrl: window.location.href,
    appVersion,
    userAgent: window.navigator.userAgent,
    language: window.navigator.language,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

export function FeedbackDialog({
  repository,
  appVersion,
}: FeedbackDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submissionIdRef = useRef<string | undefined>(undefined);
  const submissionFingerprintRef = useRef<string | undefined>(undefined);
  const requestGenerationRef = useRef(0);
  const [category, setCategory] = useState<FeedbackCategory>("inquiry");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "error" | "success">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string>();
  const [issueUrl, setIssueUrl] = useState<string>();

  const resetSubmissionId = () => {
    submissionIdRef.current = undefined;
    submissionFingerprintRef.current = undefined;
  };

  const open = () => {
    setErrorMessage(undefined);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const reset = () => {
    requestGenerationRef.current += 1;
    setCategory("inquiry");
    setMessage("");
    setWebsite("");
    setConfirmed(false);
    setState("idle");
    setErrorMessage(undefined);
    setIssueUrl(undefined);
    resetSubmissionId();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedMessage = message.trim();
    const submissionFingerprint = `${category}\u0000${normalizedMessage}`;
    if (normalizedMessage.length < 10 || normalizedMessage.length > 2_000) {
      setErrorMessage("내용은 10자 이상 2,000자 이하로 입력해 주세요.");
      return;
    }
    if (!confirmed) {
      setErrorMessage("공개되는 정보 안내를 확인해 주세요.");
      return;
    }
    if (submissionFingerprintRef.current !== submissionFingerprint)
      resetSubmissionId();
    const submissionId = submissionIdRef.current ?? crypto.randomUUID();
    submissionIdRef.current = submissionId;
    submissionFingerprintRef.current = submissionFingerprint;
    setErrorMessage(undefined);
    setState("pending");
    const requestGeneration = requestGenerationRef.current;
    try {
      const result = await repository.submitFeedback(
        collectSubmission(
          submissionId,
          category,
          normalizedMessage,
          website,
          appVersion,
        ),
      );
      if (requestGeneration !== requestGenerationRef.current) return;
      setIssueUrl(result.issueUrl);
      setState("success");
      trackAnalyticsEvent("feedback_submitted", { category });
      resetSubmissionId();
    } catch (error) {
      if (requestGeneration !== requestGenerationRef.current) return;
      setState("error");
      const code = feedbackErrorCode(error);
      if (code === "conflict") resetSubmissionId();
      setErrorMessage(errorMessages[code]);
    }
  };

  return (
    <>
      <button
        className="feedback-trigger"
        data-testid="footer-feedback-trigger"
        type="button"
        onClick={open}
      >
        <MessageCircle size={17} aria-hidden="true" /> 문의·제보하기
      </button>
      <dialog
        className="feedback-dialog"
        data-testid="feedback-dialog"
        ref={dialogRef}
        aria-labelledby="feedback-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={reset}
      >
        <header className="feedback-dialog__header">
          <div>
            <p className="eyebrow">익명 피드백</p>
            <h2 id="feedback-dialog-title">문의·제보하기</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label="문의·제보하기 닫기"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {state === "success" ? (
          <section className="feedback-success" role="status">
            <h3>제보를 등록했습니다.</h3>
            <p>공개 Issue에서 처리 상황을 확인할 수 있습니다.</p>
            {issueUrl && (
              <a href={issueUrl} target="_blank" rel="noreferrer">
                등록된 GitHub Issue 보기 <ExternalLink aria-hidden="true" />
              </a>
            )}
            <button type="button" onClick={close}>
              닫기
            </button>
          </section>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="feedback-field">
              <label htmlFor="feedback-category">분류</label>
              <select
                id="feedback-category"
                name="category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as FeedbackCategory)
                }
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="feedback-field">
              <label htmlFor="feedback-message">문의·제보 내용</label>
              <textarea
                id="feedback-message"
                name="message"
                aria-describedby={
                  errorMessage
                    ? "feedback-message-count feedback-error"
                    : "feedback-message-count"
                }
                required
                value={message}
                minLength={10}
                maxLength={2_000}
                rows={7}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setErrorMessage(undefined);
                }}
              />
              <small id="feedback-message-count">
                {message.length.toLocaleString("ko-KR")} / 2,000자
              </small>
            </div>
            <label className="feedback-honeypot" aria-hidden="true">
              Website
              <input
                name="website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                autoComplete="off"
                tabIndex={-1}
              />
            </label>
            <div className="feedback-disclosure">
              <strong>공개되는 정보</strong>
              <p>
                작성 내용, 현재 URL, 앱 버전, 브라우저 User-Agent, 언어,
                viewport 크기가 공개 GitHub Issue에 포함됩니다. 이미지, 연락처,
                기기 식별자와 IP 주소는 받지 않습니다.
              </p>
              <label>
                <input
                  type="checkbox"
                  name="public-disclosure-confirmed"
                  checked={confirmed}
                  onChange={(event) => {
                    setConfirmed(event.target.checked);
                    setErrorMessage(undefined);
                  }}
                />
                이 정보가 GitHub Issue에 공개되는 것에 동의합니다.
              </label>
            </div>
            {errorMessage && (
              <p
                className="feedback-error"
                id="feedback-error"
                data-testid="feedback-status"
                role="alert"
              >
                {errorMessage}
              </p>
            )}
            <div className="feedback-actions">
              <button type="button" onClick={close}>
                취소
              </button>
              <button type="submit" disabled={state === "pending"}>
                {state === "pending"
                  ? "보내는 중…"
                  : state === "error"
                    ? "다시 보내기"
                    : "공개 제보 보내기"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
