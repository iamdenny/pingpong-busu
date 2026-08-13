import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  DemoFeedbackRepository,
  FeedbackSubmissionError,
  SupabaseFeedbackRepository,
  type FeedbackSubmissionInput,
} from "./feedback-repository";

const input: FeedbackSubmissionInput = {
  submissionId: "00000000-0000-4000-8000-000000000023",
  category: "inquiry",
  message: "공개 기록에 관해 문의드립니다.",
  website: "",
  currentUrl: "https://example.com/pingpong-busu/search?q=test",
  appVersion: "2026.33.37",
  userAgent: "Example Browser",
  language: "ko-KR",
  viewport: { width: 390, height: 844 },
};

describe("FeedbackRepository", () => {
  it("invokes submit-feedback and parses the public issue link", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        accepted: true,
        referenceId: "feedback-23",
        status: "published",
        issueUrl: "https://github.com/example/busu/issues/23",
      },
      error: null,
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    await expect(
      new SupabaseFeedbackRepository(client).submitFeedback(input),
    ).resolves.toEqual({
      accepted: true,
      referenceId: "feedback-23",
      status: "published",
      issueUrl: "https://github.com/example/busu/issues/23",
    });
    expect(invoke).toHaveBeenCalledWith("submit-feedback", { body: input });
  });

  it.each([
    [429, "rate_limit"],
    [409, "conflict"],
    [503, "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { context: { status } },
        }),
      },
    } as unknown as SupabaseClient;

    await expect(
      new SupabaseFeedbackRepository(client).submitFeedback(input),
    ).rejects.toMatchObject({
      code,
    } satisfies Partial<FeedbackSubmissionError>);
  });

  it("maps an unavailable function transport to unavailable", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("Failed to send a request to the Edge Function"),
        }),
      },
    } as unknown as SupabaseClient;

    await expect(
      new SupabaseFeedbackRepository(client).submitFeedback(input),
    ).rejects.toMatchObject({
      code: "unavailable",
    } satisfies Partial<FeedbackSubmissionError>);
  });

  it.each(["delivery_unknown", "in_progress"] as const)(
    "maps accepted %s responses to a safe retry",
    async (status) => {
      const client = {
        functions: {
          invoke: vi.fn().mockResolvedValue({
            data: { accepted: true, referenceId: "FB-12345678", status },
            error: null,
          }),
        },
      } as unknown as SupabaseClient;

      await expect(
        new SupabaseFeedbackRepository(client).submitFeedback(input),
      ).rejects.toMatchObject({
        code: "retryable",
      } satisfies Partial<FeedbackSubmissionError>);
    },
  );

  it("never claims a real publication in demo mode", async () => {
    await expect(
      new DemoFeedbackRepository().submitFeedback(input),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
