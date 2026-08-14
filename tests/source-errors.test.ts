import { describe, expect, it } from "vitest";
import {
  SafeSourceError,
  publicSourceError,
  retryAfterMilliseconds,
} from "../supabase/functions/_shared/source-errors";

describe("publicSourceError", () => {
  it("keeps safe error codes and retry timing", () => {
    expect(
      publicSourceError(
        new SafeSourceError(
          "source_rate_limited",
          "동일 검색어 호출 제한입니다.",
          1_250,
        ),
      ),
    ).toEqual({
      code: "source_rate_limited",
      message: "동일 검색어 호출 제한입니다.",
      retryAfterMs: 1_250,
    });
  });

  it.each([
    [new DOMException("timed out", "TimeoutError"), "source_timeout"],
    [new Error("HTTP 403"), "source_blocked"],
    [new Error("검색 식별자 변경"), "source_schema_changed"],
    [new Error("error sending request"), "source_request_failed"],
  ])("maps %s to %s", (error, code) => {
    expect(publicSourceError(error).code).toBe(code);
  });

  it.each([
    "뉴티티플레이 결과 표 본문을 찾지 못했습니다.",
    "뉴티티플레이 결과에 허용되지 않은 외부 링크가 있습니다.",
    "뉴티티플레이 HTML 응답 크기가 제한을 초과했습니다.",
  ])("maps member-search schema failures: %s", (message) => {
    expect(publicSourceError(new Error(message)).code).toBe(
      "source_schema_changed",
    );
  });

  it("parses Retry-After seconds and dates within the retry cap", () => {
    const now = Date.parse("2026-08-13T00:00:00.000Z");
    expect(retryAfterMilliseconds("3", now)).toBe(3_000);
    expect(retryAfterMilliseconds("Thu, 13 Aug 2026 00:00:05 GMT", now)).toBe(
      5_000,
    );
    expect(retryAfterMilliseconds("300", now)).toBe(60_000);
    expect(retryAfterMilliseconds(null, now)).toBeUndefined();
  });
});
