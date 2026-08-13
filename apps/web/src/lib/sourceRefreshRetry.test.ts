import { describe, expect, it } from "vitest";
import type { RefreshResponse } from "./repository";
import {
  MAX_SOURCE_REFRESH_RETRIES,
  MANUAL_SOURCE_REFRESH_COOLDOWN_MS,
  MAX_MANUAL_SOURCE_REFRESH_RETRIES,
  SourceRefreshRateLimitError,
  manualSourceRetryAvailability,
  requireRefreshWithoutRateLimit,
  shouldRetrySourceRefresh,
  sourceRefreshRetryDelay,
} from "./sourceRefreshRetry";

const rateLimitedResponse: RefreshResponse = {
  refreshId: "refresh-1",
  accepted: true,
  sources: [
    {
      sourceCode: "astree",
      status: "skipped",
      reason: "source_rate_limited",
      retryAfterMs: 1_500,
    },
  ],
};

describe("source refresh retry", () => {
  it("turns a timed rate limit into a retryable error", () => {
    expect(() =>
      requireRefreshWithoutRateLimit(rateLimitedResponse, "astree"),
    ).toThrow(SourceRefreshRateLimitError);

    expect(() =>
      requireRefreshWithoutRateLimit(
        {
          ...rateLimitedResponse,
          sources: [
            {
              sourceCode: "astree",
              status: "failed",
              errorCode: "source_rate_limited",
              retryAfterMs: 5_000,
            },
          ],
        },
        "astree",
      ),
    ).toThrow(SourceRefreshRateLimitError);
  });

  it("retries only the bounded timed rate-limit error", () => {
    const error = new SourceRefreshRateLimitError(2_000, 10_000);
    expect(shouldRetrySourceRefresh(0, error)).toBe(true);
    expect(shouldRetrySourceRefresh(MAX_SOURCE_REFRESH_RETRIES, error)).toBe(
      false,
    );
    expect(shouldRetrySourceRefresh(0, new Error("network"))).toBe(false);
  });

  it("uses the server delay with a small scheduling margin", () => {
    const now = Date.now();
    const error = new SourceRefreshRateLimitError(2_000, now);
    expect(sourceRefreshRetryDelay(0, error)).toBeGreaterThanOrEqual(2_000);
    expect(sourceRefreshRetryDelay(0, error)).toBeLessThanOrEqual(2_100);
  });

  it("allows at most three manual retries with a five-second cooldown", () => {
    const first = manualSourceRetryAvailability(
      { attempts: 0, failureAt: 10_000 },
      14_999,
    );
    expect(first).toEqual({
      canRetry: false,
      remainingAttempts: MAX_MANUAL_SOURCE_REFRESH_RETRIES,
      retryAt: 10_000 + MANUAL_SOURCE_REFRESH_COOLDOWN_MS,
    });
    expect(
      manualSourceRetryAvailability({ attempts: 0, failureAt: 10_000 }, 15_000)
        .canRetry,
    ).toBe(true);

    expect(
      manualSourceRetryAvailability(
        { attempts: 3, failureAt: 10_000, lastAttemptAt: 30_000 },
        100_000,
      ),
    ).toEqual({
      canRetry: false,
      remainingAttempts: 0,
      retryAt: 30_000 + MANUAL_SOURCE_REFRESH_COOLDOWN_MS,
    });

    expect(
      manualSourceRetryAvailability(
        { attempts: 1, failureAt: 10_000, notBeforeAt: 45_000 },
        20_000,
      ),
    ).toEqual({
      canRetry: false,
      remainingAttempts: 2,
      retryAt: 45_000,
    });
  });
});
