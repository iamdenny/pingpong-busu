import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./resilient-fetch";

const policy = { timeoutMs: 100, maxAttempts: 2, retryDelayMs: 10 };

describe("fetchWithRetry", () => {
  it("retries one transient server response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const sleep = vi.fn(async () => undefined);

    const response = await fetchWithRetry("https://example.test", {}, policy, {
      fetch: fetchMock,
      sleep,
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("retries one timeout but leaves deterministic responses alone", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));

    const response = await fetchWithRetry("https://example.test", {}, policy, {
      fetch: fetchMock,
      sleep: async () => undefined,
    });

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an explicit caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      fetchWithRetry(
        "https://example.test",
        { signal: controller.signal },
        policy,
        { fetch: fetchMock, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
