export interface ResilientFetchPolicy {
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
}

interface ResilientFetchDependencies {
  fetch: typeof fetch;
  sleep: (delayMs: number) => Promise<void>;
}

const defaultDependencies: ResilientFetchDependencies = {
  fetch,
  sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
};

const retryableStatuses = new Set([408, 500, 502, 503, 504]);

function isRetryableRequestError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException &&
      ["AbortError", "TimeoutError", "NetworkError"].includes(error.name))
  );
}

export async function fetchWithRetry(
  input: string | URL | Request,
  init: RequestInit,
  policy: ResilientFetchPolicy,
  dependencies: ResilientFetchDependencies = defaultDependencies,
): Promise<Response> {
  const maxAttempts = Math.max(1, Math.floor(policy.maxAttempts));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (init.signal?.aborted) throw init.signal.reason;
    const timeoutSignal = AbortSignal.timeout(policy.timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    try {
      const response = await dependencies.fetch(input, { ...init, signal });
      if (!retryableStatuses.has(response.status) || attempt === maxAttempts) {
        return response;
      }
      await response.body?.cancel();
    } catch (error) {
      if (
        init.signal?.aborted ||
        !isRetryableRequestError(error) ||
        attempt === maxAttempts
      ) {
        throw error;
      }
    }
    await dependencies.sleep(policy.retryDelayMs * attempt);
  }
  throw new Error("출처 요청 재시도 상태가 올바르지 않습니다.");
}
