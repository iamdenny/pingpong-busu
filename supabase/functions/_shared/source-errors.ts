export interface PublicSourceError {
  code: string;
  message: string;
  retryAfterMs?: number;
}

export class SafeSourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "SafeSourceError";
  }
}

export function retryAfterMilliseconds(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - now;
  if (!Number.isFinite(delay) || delay <= 0) return undefined;
  return Math.min(60_000, Math.max(1_000, Math.ceil(delay)));
}

export function publicSourceError(error: unknown): PublicSourceError {
  if (error instanceof SafeSourceError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.retryAfterMs !== undefined
        ? { retryAfterMs: error.retryAfterMs }
        : {}),
    };
  }

  const message = error instanceof Error ? error.message : "";
  if (
    error instanceof DOMException &&
    ["AbortError", "TimeoutError"].includes(error.name)
  ) {
    return {
      code: "source_timeout",
      message: "재시도 후에도 출처 응답 시간이 초과되었습니다.",
    };
  }
  if (
    message.includes("구조") ||
    message.includes("식별자") ||
    message.includes("열 개수")
  ) {
    return {
      code: "source_schema_changed",
      message: "출처 페이지 구조가 변경되어 점검이 필요합니다.",
    };
  }
  if (message.includes("HTTP 401")) {
    return {
      code: "source_auth_failed",
      message: "출처 인증이 필요하거나 만료되었습니다.",
    };
  }
  if (message.includes("HTTP 403")) {
    return {
      code: "source_blocked",
      message: "출처가 BUSU의 조회 요청을 차단했습니다.",
    };
  }
  if (message.includes("HTTP 429")) {
    return {
      code: "source_rate_limited",
      message: "출처의 호출 제한에 도달했습니다.",
    };
  }
  if (/fetch failed|network|connection|error sending request/iu.test(message)) {
    return {
      code: "source_request_failed",
      message: "출처 서버에 연결하지 못했습니다.",
    };
  }
  return {
    code: "source_refresh_failed",
    message: "출처 기록을 갱신하지 못했습니다.",
  };
}
