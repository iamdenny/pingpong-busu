import { ChevronDown, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SourceCode } from "@busu/domain";

export interface SourceRefreshView {
  sourceCode: SourceCode;
  sourceName: string;
  state: "waiting" | "refreshing" | "succeeded" | "failed" | "skipped";
  found?: number;
  inserted?: number;
  updated?: number;
  reason?: string;
  errorCode?: string;
  message?: string;
  retryAt?: number;
  manualRetryAt?: number;
  manualRetriesRemaining?: number;
}

const errorLabels: Readonly<Record<string, string>> = {
  source_timeout: "시간 초과",
  source_blocked: "접근 차단",
  source_schema_changed: "사이트 구조 변경",
  source_circuit_open: "보호 대기",
  source_parse_error: "응답 해석 실패",
  source_not_configured: "연동 설정 누락",
  source_auth_failed: "인증 실패",
  source_request_failed: "연결 실패",
  source_persist_failed: "저장 실패",
  source_rate_limited: "호출 제한",
  source_refresh_failed: "조회 실패",
};

function isAutomaticRetryReason(reason: string | undefined): boolean {
  return reason === "source_rate_limited" || reason === "source_timeout";
}

export function sourceRefreshStateText(
  source: SourceRefreshView,
  now = Date.now(),
): string {
  if (isAutomaticRetryReason(source.reason) && source.retryAt !== undefined) {
    const label = errorLabels[source.reason ?? ""] ?? "조회 지연";
    const remainingSeconds = Math.ceil((source.retryAt - now) / 1_000);
    return remainingSeconds > 0
      ? `${label} · ${remainingSeconds}초 후 자동 재시도`
      : `${label} · 자동 재시도 중`;
  }
  if (source.state === "waiting") return "조회 대기";
  if (source.state === "refreshing") return "조회 중";
  if (source.state === "failed") {
    return errorLabels[source.errorCode ?? ""] ?? "조회 실패";
  }
  if (source.state === "skipped") {
    if (source.reason === "source_disabled") return "연동 꺼짐";
    if (source.reason === "fresh") return "최근 확인 완료";
    if (source.reason === "manual_only") return "원문 수동 확인";
    if (source.reason === "demo_mode") return "데모 모드";
    if (source.reason === "source_rate_limited") return "호출 제한";
    return "조회 제외";
  }
  const changes = (source.inserted ?? 0) + (source.updated ?? 0);
  return changes > 0 ? `완료 · 신규·변경 ${changes}건` : "완료 · 새 기록 없음";
}

function statusClass(source: SourceRefreshView): string {
  if (source.state === "succeeded") return "fresh";
  if (source.state === "waiting" || source.state === "refreshing")
    return "refreshing";
  if (source.reason === "source_disabled") return "unsupported";
  return "delayed";
}

function SourceRefreshDisclosure({
  sources,
  now,
  summary,
  initiallyExpanded,
  isComplete,
  completed,
  onRetry,
}: {
  sources: SourceRefreshView[];
  now: number;
  summary: string;
  initiallyExpanded: boolean;
  isComplete: boolean;
  completed: number;
  onRetry?: (sourceCode: SourceCode, attemptedAt: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const hasUserToggled = useRef(false);
  const wasComplete = useRef(isComplete);

  useEffect(() => {
    if (isComplete && !wasComplete.current) {
      setIsExpanded(false);
    } else if (!hasUserToggled.current && !isComplete) {
      setIsExpanded(initiallyExpanded);
    }
    wasComplete.current = isComplete;
  }, [initiallyExpanded, isComplete]);

  return (
    <section
      className="source-refresh-progress"
      aria-labelledby="source-refresh-title"
      data-expanded={isExpanded}
      data-refreshing={!isComplete}
    >
      <div className="source-refresh-progress__heading">
        <div>
          <p className="eyebrow">실시간 출처 조회</p>
          <h2 id="source-refresh-title">{summary}</h2>
        </div>
        <p
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {summary}
        </p>
        <button
          type="button"
          className="source-refresh-progress__toggle"
          aria-controls="source-refresh-details"
          aria-expanded={isExpanded}
          aria-label={`실시간 출처 조회 상세 ${isExpanded ? "접기" : "보기"}`}
          onClick={() => {
            hasUserToggled.current = true;
            setIsExpanded((expanded) => !expanded);
          }}
        >
          상세 {isExpanded ? "접기" : "보기"}
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </div>
      {!isExpanded && !isComplete && (
        <div
          className="source-refresh-progress__meter"
          aria-label={`출처 조회 진행률: ${sources.length}곳 중 ${completed}곳 완료`}
          aria-valuemax={sources.length}
          aria-valuemin={0}
          aria-valuenow={completed}
          aria-valuetext={`${sources.length}곳 중 ${completed}곳 완료`}
          role="progressbar"
        >
          <span
            className="source-refresh-progress__meter-fill"
            style={{ width: `${(completed / sources.length) * 100}%` }}
          />
        </div>
      )}
      <div
        id="source-refresh-details"
        className="source-refresh-progress__details"
        data-expanded={isExpanded}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
        <div className="source-refresh-progress__details-inner">
          <ul role="list">
            {sources.map((source) => {
              const retrySeconds = Math.max(
                0,
                Math.ceil(((source.manualRetryAt ?? 0) - now) / 1_000),
              );
              const retriesRemaining = source.manualRetriesRemaining ?? 0;
              const retryDisabled = retrySeconds > 0 || retriesRemaining === 0;
              const retryText =
                retriesRemaining === 0
                  ? "한도 도달"
                  : retrySeconds > 0
                    ? `${retrySeconds}초`
                    : "재시도";
              return (
                <li key={source.sourceCode}>
                  <span className="source-refresh-progress__source">
                    <i
                      className={`status-dot status-dot--${statusClass(source)}`}
                      aria-hidden="true"
                    />
                    {source.sourceName}
                  </span>
                  <span className="source-refresh-progress__result">
                    <strong>{sourceRefreshStateText(source, now)}</strong>
                    {source.message && <small>{source.message}</small>}
                  </span>
                  {source.state === "failed" && onRetry && (
                    <button
                      type="button"
                      className="source-refresh-progress__retry"
                      aria-disabled={retryDisabled}
                      aria-label={`${source.sourceName} 재시도${retrySeconds > 0 ? `, ${retrySeconds}초 후 가능` : retriesRemaining > 0 ? `, ${retriesRemaining}회 남음` : ", 한도 도달"}`}
                      onClick={() => {
                        if (!retryDisabled) onRetry(source.sourceCode, now);
                      }}
                    >
                      <RotateCcw aria-hidden="true" size={12} />
                      {retryText}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function SourceRefreshProgress({
  sources,
  existingRecordCount,
  searchKey = "default",
  onRetry,
}: {
  sources: SourceRefreshView[];
  existingRecordCount: number | null;
  searchKey?: string;
  onRetry?: (sourceCode: SourceCode, attemptedAt: number) => void;
}) {
  const [now, setNow] = useState(Date.now);
  const hasTimedRetry = sources.some(
    (source) =>
      (isAutomaticRetryReason(source.reason) && source.retryAt !== undefined) ||
      (source.state === "failed" &&
        source.manualRetryAt !== undefined &&
        source.manualRetryAt > now),
  );

  useEffect(() => {
    if (!hasTimedRetry) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [hasTimedRetry]);

  const completed = sources.filter(
    (source) => !["waiting", "refreshing"].includes(source.state),
  ).length;
  const refreshing = sources.length - completed;
  const needsAttention = sources.filter(
    (source) =>
      source.state === "failed" ||
      (source.state === "skipped" &&
        !["fresh", "demo_mode"].includes(source.reason ?? "")),
  ).length;
  const summary =
    refreshing > 0
      ? `${sources.length}곳 중 ${completed}곳 완료 · ${refreshing}곳 조회 중`
      : needsAttention > 0
        ? `${sources.length}곳 조회 완료 · ${needsAttention}곳 확인 필요`
        : `${sources.length}곳 조회 완료`;
  const isComplete = refreshing === 0;
  const initiallyExpanded = !isComplete && existingRecordCount === 0;

  return (
    <SourceRefreshDisclosure
      key={searchKey}
      sources={sources}
      now={now}
      summary={summary}
      initiallyExpanded={initiallyExpanded}
      isComplete={isComplete}
      completed={completed}
      {...(onRetry ? { onRetry } : {})}
    />
  );
}
