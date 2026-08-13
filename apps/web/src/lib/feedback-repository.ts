import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const feedbackCategories = [
  "inquiry",
  "data_correction",
  "bug",
  "feature",
] as const;

export type FeedbackCategory = (typeof feedbackCategories)[number];

export interface FeedbackSubmissionInput {
  submissionId: string;
  category: FeedbackCategory;
  message: string;
  website: string;
  currentUrl: string;
  appVersion: string;
  userAgent: string;
  language: string;
  viewport: {
    width: number;
    height: number;
  };
}

export interface FeedbackSubmissionResponse {
  accepted: true;
  referenceId: string;
  status: "published";
  issueUrl?: string | undefined;
}

export interface FeedbackRepository {
  submitFeedback(
    input: FeedbackSubmissionInput,
  ): Promise<FeedbackSubmissionResponse>;
}

export type FeedbackErrorCode =
  | "validation"
  | "sensitive_content"
  | "rate_limit"
  | "unavailable"
  | "retryable"
  | "conflict"
  | "unknown";

export class FeedbackSubmissionError extends Error {
  constructor(
    public readonly code: FeedbackErrorCode,
    message = code,
  ) {
    super(message);
    this.name = "FeedbackSubmissionError";
  }
}

const responseSchema = z.object({
  accepted: z.literal(true),
  referenceId: z.string().min(1),
  status: z.literal("published"),
  issueUrl: z.url().startsWith("https://").optional(),
});

const pendingResponseSchema = z.object({
  accepted: z.literal(true),
  referenceId: z.string().min(1),
  status: z.enum(["delivery_unknown", "in_progress"]),
});

const errorSchema = z.object({ code: z.string() }).passthrough();

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("context" in error))
    return undefined;
  const context = error.context;
  if (!context || typeof context !== "object" || !("status" in context))
    return undefined;
  return typeof context.status === "number" ? context.status : undefined;
}

async function serverErrorCode(error: unknown): Promise<string | undefined> {
  if (!error || typeof error !== "object" || !("context" in error)) return;
  const context = error.context;
  if (!(context instanceof Response)) return;
  try {
    return errorSchema.safeParse(await context.clone().json()).data?.code;
  } catch {
    return undefined;
  }
}

function mappedErrorCode(
  status: number | undefined,
  serverCode: string | undefined,
): FeedbackErrorCode {
  if (serverCode === "invalid_request") return "validation";
  if (serverCode === "sensitive_content") return "sensitive_content";
  if (serverCode === "rate_limited" || status === 429) return "rate_limit";
  if (
    serverCode === "server_not_configured" ||
    serverCode === "delivery_failed" ||
    status === 503
  )
    return "unavailable";
  if (
    serverCode === "delivery_unknown" ||
    serverCode === "in_progress" ||
    (status !== undefined && status >= 500)
  )
    return "retryable";
  if (serverCode === "submission_conflict" || status === 409) return "conflict";
  return "unavailable";
}

export class SupabaseFeedbackRepository implements FeedbackRepository {
  constructor(private readonly client: SupabaseClient) {}

  async submitFeedback(
    input: FeedbackSubmissionInput,
  ): Promise<FeedbackSubmissionResponse> {
    const { data, error } = await this.client.functions.invoke(
      "submit-feedback",
      { body: input },
    );
    if (error) {
      const code = mappedErrorCode(
        errorStatus(error),
        await serverErrorCode(error),
      );
      throw new FeedbackSubmissionError(code);
    }
    if (pendingResponseSchema.safeParse(data).success)
      throw new FeedbackSubmissionError("retryable");
    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) throw new FeedbackSubmissionError("unknown");
    return parsed.data;
  }
}

export class DemoFeedbackRepository implements FeedbackRepository {
  async submitFeedback(
    input: FeedbackSubmissionInput,
  ): Promise<FeedbackSubmissionResponse> {
    void input;
    throw new FeedbackSubmissionError("unavailable");
  }
}

export function createSupabaseFeedbackRepository(
  url: string,
  publishableKey: string,
): FeedbackRepository {
  return new SupabaseFeedbackRepository(createClient(url, publishableKey));
}
