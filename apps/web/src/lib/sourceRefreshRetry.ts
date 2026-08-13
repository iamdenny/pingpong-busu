import type { SourceCode } from "@busu/domain";
import type { RefreshResponse } from "./repository";

export const MAX_SOURCE_REFRESH_RETRIES = 2;
export const MAX_MANUAL_SOURCE_REFRESH_RETRIES = 3;
export const MANUAL_SOURCE_REFRESH_COOLDOWN_MS = 5_000;
export const SOURCE_TIMEOUT_RETRY_DELAY_MS = 5_000;

export interface ManualSourceRetryState {
  attempts: number;
  failureAt: number;
  lastAttemptAt?: number;
  notBeforeAt?: number;
}

export interface ManualSourceRetryAvailability {
  canRetry: boolean;
  remainingAttempts: number;
  retryAt: number;
}

export function manualSourceRetryAvailability(
  state: ManualSourceRetryState,
  now = Date.now(),
): ManualSourceRetryAvailability {
  const attempts = Math.max(0, Math.floor(state.attempts));
  const remainingAttempts = Math.max(
    0,
    MAX_MANUAL_SOURCE_REFRESH_RETRIES - attempts,
  );
  const retryAt = Math.max(
    Math.max(state.failureAt, state.lastAttemptAt ?? 0) +
      MANUAL_SOURCE_REFRESH_COOLDOWN_MS,
    state.notBeforeAt ?? 0,
  );
  return {
    canRetry: remainingAttempts > 0 && now >= retryAt,
    remainingAttempts,
    retryAt,
  };
}

export class SourceRefreshRateLimitError extends Error {
  readonly retryAfterMs: number;
  readonly retryAt: number;

  constructor(retryAfterMs: number, now = Date.now()) {
    const safeDelay = Math.min(60_000, Math.max(1_000, retryAfterMs));
    super("동일 검색어 호출 제한");
    this.name = "SourceRefreshRateLimitError";
    this.retryAfterMs = safeDelay;
    this.retryAt = now + safeDelay;
  }
}

export class SourceRefreshTimeoutError extends Error {
  readonly retryAfterMs: number;
  readonly retryAt: number;

  constructor(retryAfterMs = SOURCE_TIMEOUT_RETRY_DELAY_MS, now = Date.now()) {
    const safeDelay = Math.min(
      60_000,
      Math.max(SOURCE_TIMEOUT_RETRY_DELAY_MS, retryAfterMs),
    );
    super("출처 응답 시간 초과");
    this.name = "SourceRefreshTimeoutError";
    this.retryAfterMs = safeDelay;
    this.retryAt = now + safeDelay;
  }
}

export function requireRefreshWithoutRetryableFailure(
  response: RefreshResponse,
  sourceCode: SourceCode,
): RefreshResponse {
  const outcome = response.sources.find(
    (source) => source.sourceCode === sourceCode,
  );
  if (
    ((outcome?.status === "skipped" &&
      outcome.reason === "source_rate_limited") ||
      (outcome?.status === "failed" &&
        outcome.errorCode === "source_rate_limited")) &&
    outcome.retryAfterMs !== undefined
  ) {
    throw new SourceRefreshRateLimitError(outcome.retryAfterMs);
  }
  if (
    sourceCode === "airping" &&
    outcome?.status === "failed" &&
    outcome.errorCode === "source_timeout" &&
    outcome.retryAfterMs !== undefined
  ) {
    throw new SourceRefreshTimeoutError(outcome.retryAfterMs);
  }
  return response;
}

export function shouldRetrySourceRefresh(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    (error instanceof SourceRefreshRateLimitError ||
      error instanceof SourceRefreshTimeoutError) &&
    failureCount < MAX_SOURCE_REFRESH_RETRIES
  );
}

export function sourceRefreshRetryDelay(
  _failureCount: number,
  error: unknown,
): number {
  if (
    !(error instanceof SourceRefreshRateLimitError) &&
    !(error instanceof SourceRefreshTimeoutError)
  )
    return 0;
  return Math.max(0, error.retryAt - Date.now()) + 100;
}

export function asRateLimitError(
  error: unknown,
): SourceRefreshRateLimitError | undefined {
  return error instanceof SourceRefreshRateLimitError ? error : undefined;
}

export function asTimeoutError(
  error: unknown,
): SourceRefreshTimeoutError | undefined {
  return error instanceof SourceRefreshTimeoutError ? error : undefined;
}
