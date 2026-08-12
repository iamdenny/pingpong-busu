import type { SourceCode } from "@busu/domain";
import type { RefreshResponse } from "./repository";

export const MAX_SOURCE_REFRESH_RETRIES = 2;

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

export function requireRefreshWithoutRateLimit(
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
  return response;
}

export function shouldRetrySourceRefresh(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    error instanceof SourceRefreshRateLimitError &&
    failureCount < MAX_SOURCE_REFRESH_RETRIES
  );
}

export function sourceRefreshRetryDelay(
  _failureCount: number,
  error: unknown,
): number {
  if (!(error instanceof SourceRefreshRateLimitError)) return 0;
  return Math.max(0, error.retryAt - Date.now()) + 100;
}

export function asRateLimitError(
  error: unknown,
): SourceRefreshRateLimitError | undefined {
  return error instanceof SourceRefreshRateLimitError ? error : undefined;
}
