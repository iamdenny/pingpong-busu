import { describe, expect, it } from "vitest";
import { hashRequestOrigin } from "../supabase/functions/_shared/request-origin";

describe("request origin hashing", () => {
  it("creates a stable, domain-separated hash without returning the address", async () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    const first = await hashRequestOrigin(request, "server-secret");
    const second = await hashRequestOrigin(request, "server-secret");
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).toBe(second);
    expect(first).not.toContain("203.0.113.9");
  });

  it("separates different request origins", async () => {
    const first = await hashRequestOrigin(
      new Request("https://example.test", {
        headers: { "cf-connecting-ip": "203.0.113.9" },
      }),
      "server-secret",
    );
    const second = await hashRequestOrigin(
      new Request("https://example.test", {
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      "server-secret",
    );
    expect(first).not.toBe(second);
  });
});
