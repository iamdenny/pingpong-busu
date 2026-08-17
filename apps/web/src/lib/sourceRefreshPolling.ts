import type { SourceCode } from "@busu/domain";
import type { RefreshResponse } from "./repository";

/** 예약 워커가 10분마다 한 작업을 처리하므로 그보다 촘촘하게 확인한다. */
export const QUEUED_REFRESH_POLL_INTERVAL_MS = 60_000;
/** 화면을 오래 열어두어도 재확인이 무한히 반복되지 않도록 상한을 둔다. */
export const QUEUED_REFRESH_POLL_LIMIT = 20;

/**
 * 예약 상태에서만 상태를 다시 확인한다. 진행 중 작업이 있으면 enqueue RPC가
 * 예약 예산을 올리기 전에 조기 반환하므로 재확인은 큐 예산을 쓰지 않는다.
 */
export function queuedRefreshPollInterval(
  response: RefreshResponse | undefined,
  sourceCode: SourceCode,
  completedFetchCount: number,
): number | false {
  if (!response) return false;
  if (completedFetchCount >= QUEUED_REFRESH_POLL_LIMIT) return false;
  const outcome = response.sources.find(
    (source) => source.sourceCode === sourceCode,
  );
  return outcome?.status === "queued" ? QUEUED_REFRESH_POLL_INTERVAL_MS : false;
}
