import { useEffect, useState } from "react";
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
}

const errorLabels: Readonly<Record<string, string>> = {
  source_timeout: "시간 초과",
  source_blocked: "접근 차단",
  source_schema_changed: "사이트 구조 변경",
  source_parse_error: "응답 해석 실패",
  source_not_configured: "연동 설정 누락",
  source_auth_failed: "인증 실패",
  source_request_failed: "연결 실패",
  source_persist_failed: "저장 실패",
  source_rate_limited: "호출 제한",
  source_refresh_failed: "조회 실패",
};

export function sourceRefreshStateText(
  source: SourceRefreshView,
  now = Date.now(),
): string {
  if (source.reason === "source_rate_limited" && source.retryAt !== undefined) {
    const remainingSeconds = Math.ceil((source.retryAt - now) / 1_000);
    return remainingSeconds > 0
      ? `호출 제한 · ${remainingSeconds}초 후 자동 재시도`
      : "호출 제한 · 자동 재시도 중";
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

export function SourceRefreshProgress({
  sources,
}: {
  sources: SourceRefreshView[];
}) {
  const [now, setNow] = useState(Date.now);
  const hasTimedRetry = sources.some(
    (source) =>
      source.reason === "source_rate_limited" && source.retryAt !== undefined,
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

  return (
    <section
      className="source-refresh-progress"
      aria-labelledby="source-refresh-title"
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
      </div>
      <ul role="list">
        {sources.map((source) => (
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
          </li>
        ))}
      </ul>
    </section>
  );
}
