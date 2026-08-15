import { describe, expect, it } from "vitest";
import { hasValidPublishableApiKey } from "../supabase/functions/_shared/auth";
import { hasValidWorkerAuthorization } from "../supabase/functions/_shared/worker-auth";

const request = (key?: string) =>
  new Request("https://example.test/functions/v1/refresh-player", {
    method: "POST",
    headers: key ? { apikey: key } : {},
  });

describe("Edge Function publishable key authentication", () => {
  it("accepts a named hosted publishable key", () => {
    expect(
      hasValidPublishableApiKey(request("public-key"), {
        publishableKeys: JSON.stringify({ default: "public-key" }),
      }),
    ).toBe(true);
  });

  it("accepts local and legacy public keys", () => {
    expect(
      hasValidPublishableApiKey(request("local-key"), {
        publishableKey: "local-key",
      }),
    ).toBe(true);
    expect(
      hasValidPublishableApiKey(request("anon-key"), {
        legacyAnonKey: "anon-key",
      }),
    ).toBe(true);
  });

  it("rejects missing, unknown, or malformed key configuration", () => {
    expect(
      hasValidPublishableApiKey(request(), { publishableKeys: "{broken" }),
    ).toBe(false);
    expect(
      hasValidPublishableApiKey(request("wrong-key"), {
        publishableKeys: JSON.stringify({ default: "public-key" }),
      }),
    ).toBe(false);
  });
});

describe("refresh worker bearer authentication", () => {
  const workerToken = "a".repeat(64);
  const workerRequest = (authorization?: string) =>
    new Request("https://example.test/functions/v1/refresh-player", {
      headers: authorization ? { authorization } : {},
    });

  it("accepts only the configured bearer token", async () => {
    await expect(
      hasValidWorkerAuthorization(
        workerRequest(`Bearer ${workerToken}`),
        workerToken,
      ),
    ).resolves.toBe(true);
    await expect(
      hasValidWorkerAuthorization(
        workerRequest("Bearer wrong-worker-token"),
        workerToken,
      ),
    ).resolves.toBe(false);
  });

  it("fails closed for missing, malformed, or missing expected tokens", async () => {
    await expect(
      hasValidWorkerAuthorization(workerRequest(), workerToken),
    ).resolves.toBe(false);
    await expect(
      hasValidWorkerAuthorization(
        workerRequest(`Basic ${workerToken}`),
        workerToken,
      ),
    ).resolves.toBe(false);
    await expect(
      hasValidWorkerAuthorization(
        workerRequest(`Bearer ${workerToken}`),
        undefined,
      ),
    ).resolves.toBe(false);
    await expect(
      hasValidWorkerAuthorization(workerRequest("Bearer "), workerToken),
    ).resolves.toBe(false);
  });

  it("rejects weak or malformed configured tokens", async () => {
    await expect(
      hasValidWorkerAuthorization(
        workerRequest("Bearer strong-worker-token"),
        "strong-worker-token",
      ),
    ).resolves.toBe(false);
    await expect(
      hasValidWorkerAuthorization(
        workerRequest(`Bearer ${"g".repeat(64)}`),
        "g".repeat(64),
      ),
    ).resolves.toBe(false);
  });
});
