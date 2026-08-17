import { describe, expect, it } from "vitest";

import type { RefreshResponse } from "./repository";
import {
  QUEUED_REFRESH_POLL_INTERVAL_MS,
  QUEUED_REFRESH_POLL_LIMIT,
  queuedRefreshPollInterval,
} from "./sourceRefreshPolling";

function response(
  status: "queued" | "skipped" | "succeeded" | "failed",
): RefreshResponse {
  return {
    refreshId: "job:1",
    accepted: true,
    sources: [{ sourceCode: "iping", status }],
  };
}

describe("queuedRefreshPollInterval", () => {
  it("keeps checking a queued source until the worker resolves it", () => {
    expect(queuedRefreshPollInterval(response("queued"), "iping", 1)).toBe(
      QUEUED_REFRESH_POLL_INTERVAL_MS,
    );
  });

  it("stops as soon as the source leaves the queue", () => {
    expect(queuedRefreshPollInterval(response("skipped"), "iping", 1)).toBe(
      false,
    );
    expect(queuedRefreshPollInterval(response("succeeded"), "iping", 1)).toBe(
      false,
    );
    expect(queuedRefreshPollInterval(response("failed"), "iping", 1)).toBe(
      false,
    );
  });

  it("does not poll before the first result or for another source", () => {
    expect(queuedRefreshPollInterval(undefined, "iping", 0)).toBe(false);
    expect(queuedRefreshPollInterval(response("queued"), "astree", 1)).toBe(
      false,
    );
  });

  it("bounds polling so a page left open stops checking", () => {
    expect(
      queuedRefreshPollInterval(
        response("queued"),
        "iping",
        QUEUED_REFRESH_POLL_LIMIT - 1,
      ),
    ).toBe(QUEUED_REFRESH_POLL_INTERVAL_MS);
    expect(
      queuedRefreshPollInterval(
        response("queued"),
        "iping",
        QUEUED_REFRESH_POLL_LIMIT,
      ),
    ).toBe(false);
  });
});
