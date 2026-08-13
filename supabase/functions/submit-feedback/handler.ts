import {
  hasValidPublishableApiKey,
  type FunctionAuthEnvironment,
} from "../_shared/auth.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const categories = new Set(["inquiry", "data_correction", "bug", "feature"]);
const feedbackGithubRepository = "iamdenny/pingpong-busu";
const categoryLabels: Record<string, string> = {
  inquiry: "문의",
  data_correction: "데이터 정정",
  bug: "오류 제보",
  feature: "기능 제안",
};
const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu;
const phonePattern =
  /(?:(?:\+?82[ -]?)?0?1[016789][ -]?\d{3,4}[ -]?\d{4}|0(?:2|[3-6][1-5])[ -]?\d{3,4}[ -]?\d{4})/u;
const fullBirthdatePattern =
  /(?:19|20)\d{2}\s*(?:년|[./-])\s*(?:0?[1-9]|1[0-2])\s*(?:월|[./-])\s*(?:0?[1-9]|[12]\d|3[01])\s*일?/u;
const addressPattern =
  /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별자치도|특별자치시|특별시|광역시|도)?\s+[가-힣]{1,20}(?:시|군|구)\s+[가-힣0-9·.-]{1,30}(?:로|길|동|읍|면)\s*\d{1,5}/u;
const sensitivePatterns = [
  emailPattern,
  phonePattern,
  fullBirthdatePattern,
  addressPattern,
] as const;
const encoder = new TextEncoder();

export type FeedbackRpc = (
  name:
    | "reserve_feedback_submission_internal"
    | "claim_feedback_delivery_internal"
    | "finalize_feedback_delivery_internal"
    | "mark_feedback_delivery_internal",
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error?: { message: string } | null }>;

export interface SubmitFeedbackEnvironment extends FunctionAuthEnvironment {
  serviceRoleKey?: string;
  githubRepository?: string;
  githubToken?: string;
  feedbackAllowedOrigins?: string;
}

interface SubmitFeedbackDependencies {
  environment: SubmitFeedbackEnvironment;
  rpc: FeedbackRpc;
  fetch: typeof fetch;
}

interface FeedbackInput {
  submissionId: string;
  category: string;
  message: string;
  pageUrl: string;
  appVersion: string;
  browserLanguage: string;
  viewportWidth: number;
  viewportHeight: number;
  website: string;
}

interface DeliveryClaim {
  action: "deliver" | "reconcile" | "published" | "in_progress";
  deliveryToken?: string;
  referenceId: string;
  issueNumber?: number;
  issueUrl?: string;
}

interface PublishedIssue {
  issueNumber: number;
  issueUrl: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
  record: Record<string, unknown>,
  camel: string,
  snake: string,
): string | undefined {
  const value = record[camel] ?? record[snake];
  return typeof value === "string" ? value : undefined;
}

function getNumber(
  record: Record<string, unknown>,
  camel: string,
  snake: string,
): number | undefined {
  const value = record[camel] ?? record[snake];
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function parseClaim(
  value: unknown,
  deliveryToken: string,
  referenceId: string,
): DeliveryClaim | undefined {
  if (!isRecord(value)) return undefined;
  const status = getString(value, "status", "status");
  const previousStatus = getString(value, "previousStatus", "previous_status");
  const claimed = value.claimed;
  const issueNumber = getNumber(value, "issueNumber", "issue_number");
  const issueUrl = getString(value, "issueUrl", "issue_url");
  if (status === "published" && claimed === false && issueNumber && issueUrl)
    return { action: "published", referenceId, issueNumber, issueUrl };
  if (status === "delivering" && claimed === false)
    return { action: "in_progress", referenceId };
  if (status === "delivering" && claimed === true)
    return {
      action:
        previousStatus === "pending" || previousStatus === "failed"
          ? "deliver"
          : "reconcile",
      referenceId,
      deliveryToken,
    };
  return undefined;
}

function parseInput(
  value: unknown,
  requestOrigin: string | null,
  allowedOrigins: ReadonlySet<string>,
): FeedbackInput {
  if (!isRecord(value) || !isRecord(value.viewport))
    throw new Error("invalid_input");
  const submissionId =
    typeof value.submissionId === "string"
      ? value.submissionId.toLowerCase()
      : "";
  const category = typeof value.category === "string" ? value.category : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";
  const pageUrlValue = value.pageUrl ?? value.currentUrl;
  const pageUrl = typeof pageUrlValue === "string" ? pageUrlValue : "";
  const appVersion =
    typeof value.appVersion === "string" ? value.appVersion.trim() : "";
  const browserLanguageValue = value.browserLanguage ?? value.language;
  const browserLanguage =
    typeof browserLanguageValue === "string" ? browserLanguageValue.trim() : "";
  const website = typeof value.website === "string" ? value.website.trim() : "";
  const viewportWidth = value.viewport.width;
  const viewportHeight = value.viewport.height;
  if (
    !uuidPattern.test(submissionId) ||
    !categories.has(category) ||
    message.length < 10 ||
    message.length > 2000
  )
    throw new Error("invalid_input");
  if (
    !appVersion ||
    appVersion.length > 32 ||
    !browserLanguage ||
    browserLanguage.length > 35
  )
    throw new Error("invalid_input");
  if (
    !Number.isInteger(viewportWidth) ||
    !Number.isInteger(viewportHeight) ||
    Number(viewportWidth) < 1 ||
    Number(viewportHeight) < 1 ||
    Number(viewportWidth) > 10000 ||
    Number(viewportHeight) > 10000
  )
    throw new Error("invalid_input");
  if (pageUrl.length < 1 || pageUrl.length > 2048 || !requestOrigin)
    throw new Error("invalid_input");
  let parsedPage: URL;
  let parsedOrigin: URL;
  try {
    parsedPage = new URL(pageUrl);
    parsedOrigin = new URL(requestOrigin);
  } catch {
    throw new Error("invalid_input");
  }
  if (
    !["http:", "https:"].includes(parsedPage.protocol) ||
    parsedPage.username ||
    parsedPage.password ||
    parsedOrigin.origin !== requestOrigin ||
    !allowedOrigins.has(parsedOrigin.origin) ||
    parsedPage.origin !== requestOrigin
  )
    throw new Error("invalid_input");
  if (sensitivePatterns.some((pattern) => pattern.test(message)))
    throw new Error("sensitive_input");
  parsedPage.search = "";
  parsedPage.hash = parsedPage.hash.replace(/\?.*$/u, "");
  let decodedPageUrl: string;
  try {
    decodedPageUrl = decodeURIComponent(parsedPage.toString());
  } catch {
    throw new Error("invalid_input");
  }
  if (sensitivePatterns.some((pattern) => pattern.test(decodedPageUrl)))
    throw new Error("sensitive_input");
  return {
    submissionId,
    category,
    message,
    pageUrl: parsedPage.toString(),
    appVersion,
    browserLanguage,
    viewportWidth: Number(viewportWidth),
    viewportHeight: Number(viewportHeight),
    website,
  };
}

function parseAllowedOrigins(value: string | undefined): ReadonlySet<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => {
        try {
          return new URL(origin).origin === origin;
        } catch {
          return false;
        }
      }),
  );
}

function error(code: string, message: string, status: number): Response {
  return json({ code, message }, status);
}

async function digestHex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function neutralize(value: string): string {
  return value
    .replaceAll("@", "@\u200b")
    .replaceAll("<", "‹")
    .replaceAll(">", "›")
    .replaceAll("`", "ʼ")
    .replaceAll("[", "［")
    .replaceAll("]", "］")
    .replaceAll("#", "＃")
    .replace(/^\s*([-+*]|\d+[.)])\s+/gmu, "· ");
}

function githubContent(
  input: FeedbackInput,
  userAgent: string,
  referenceId: string,
): { title: string; body: string } {
  const label = categoryLabels[input.category] ?? "문의·제보";
  const summary = neutralize(input.message.replace(/\s+/gu, " ").slice(0, 70));
  const message = neutralize(input.message)
    .split("\n")
    .map((line) => `│ ${line}`)
    .join("\n");
  return {
    title: `[BUSU][${label}] ${summary}`,
    body: [
      `<!-- busu-feedback:${input.submissionId} -->`,
      "",
      "## 제보 내용",
      "",
      message,
      "",
      "## 진단 정보",
      "",
      `- 분류: ${label}`,
      `- 페이지: ${neutralize(input.pageUrl)}`,
      `- 앱 버전: ${neutralize(input.appVersion)}`,
      `- User-Agent: ${neutralize(userAgent)}`,
      `- 브라우저 언어: ${neutralize(input.browserLanguage)}`,
      `- 화면 크기: ${input.viewportWidth} × ${input.viewportHeight}`,
      `- 제보 참조: ${neutralize(referenceId)}`,
      "",
      "_이 이슈는 BUSU 익명 문의·제보 기능으로 등록되었습니다._",
    ].join("\n"),
  };
}

function validRepository(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)
  );
}

function githubHeaders(token: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };
}

function githubSignal(): AbortSignal {
  return AbortSignal.timeout(8000);
}

function parsePublishedIssue(
  value: unknown,
  repository: string,
): PublishedIssue | undefined {
  if (!isRecord(value)) return undefined;
  const issueNumber =
    typeof value.number === "number" &&
    Number.isInteger(value.number) &&
    value.number > 0
      ? value.number
      : undefined;
  const issueUrl =
    typeof value.html_url === "string" ? value.html_url : undefined;
  if (!issueNumber || !issueUrl) return undefined;
  try {
    const parsed = new URL(issueUrl);
    if (
      parsed.origin !== "https://github.com" ||
      !parsed.pathname.startsWith(`/${repository}/issues/`)
    )
      return undefined;
  } catch {
    return undefined;
  }
  return { issueNumber, issueUrl };
}

async function recordFailure(
  rpc: FeedbackRpc,
  submissionId: string,
  deliveryToken: string,
  errorCode: string,
  ambiguous: boolean,
): Promise<void> {
  await rpc("mark_feedback_delivery_internal", {
    p_submission_id: submissionId,
    p_delivery_token: deliveryToken,
    p_error_code: errorCode,
    p_outcome: ambiguous ? "delivery_unknown" : "failed",
  });
}

async function finish(
  rpc: FeedbackRpc,
  input: FeedbackInput,
  claim: DeliveryClaim,
  issue: PublishedIssue,
): Promise<Response> {
  const result = await rpc("finalize_feedback_delivery_internal", {
    p_submission_id: input.submissionId,
    p_delivery_token: claim.deliveryToken,
    p_issue_number: issue.issueNumber,
    p_issue_url: issue.issueUrl,
  });
  if (result.error) {
    await recordFailure(
      rpc,
      input.submissionId,
      claim.deliveryToken as string,
      "finalization_unknown",
      true,
    );
    return json(
      {
        accepted: true,
        status: "delivery_unknown",
        referenceId: claim.referenceId,
      },
      202,
    );
  }
  return json(
    {
      accepted: true,
      status: "published",
      referenceId: claim.referenceId,
      ...issue,
    },
    claim.action === "deliver" ? 201 : 200,
  );
}

export function createSubmitFeedbackHandler(
  dependencies: SubmitFeedbackDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === "OPTIONS") return new Response("ok");
    if (request.method !== "POST")
      return error("method_not_allowed", "지원하지 않는 요청입니다.", 405);
    if (!hasValidPublishableApiKey(request, dependencies.environment))
      return error("unauthorized", "인증할 수 없습니다.", 401);
    const allowedOrigins = parseAllowedOrigins(
      dependencies.environment.feedbackAllowedOrigins,
    );
    if (allowedOrigins.size === 0)
      return error(
        "server_not_configured",
        "제보 기능을 사용할 수 없습니다.",
        503,
      );
    let input: FeedbackInput;
    try {
      input = parseInput(
        await request.json(),
        request.headers.get("origin"),
        allowedOrigins,
      );
    } catch (caught) {
      if (caught instanceof Error && caught.message === "sensitive_input")
        return error(
          "sensitive_content",
          "민감한 개인정보를 제거해 주세요.",
          400,
        );
      return error("invalid_request", "제보 내용을 확인해 주세요.", 400);
    }
    if (input.website) return json({ accepted: true }, 202);
    const { serviceRoleKey, githubRepository, githubToken } =
      dependencies.environment;
    if (
      !serviceRoleKey ||
      !githubToken ||
      !validRepository(githubRepository) ||
      githubRepository !== feedbackGithubRepository
    )
      return error(
        "server_not_configured",
        "제보 기능을 사용할 수 없습니다.",
        503,
      );
    const userAgentHeader = request.headers.get("user-agent")?.trim() ?? "";
    const userAgent = userAgentHeader.slice(0, 512) || "unknown";
    const payloadHash = await digestHex(
      JSON.stringify({ ...input, website: undefined, userAgent }),
    );
    const reserveResult = await dependencies.rpc(
      "reserve_feedback_submission_internal",
      {
        p_submission_id: input.submissionId,
        p_category: input.category,
        p_message: input.message,
        p_page_url: input.pageUrl,
        p_app_version: input.appVersion,
        p_user_agent: userAgent,
        p_language: input.browserLanguage,
        p_viewport_width: input.viewportWidth,
        p_viewport_height: input.viewportHeight,
        p_payload_hash: payloadHash,
      },
    );
    if (reserveResult.error) {
      if (reserveResult.error.message.includes("feedback_rate_limited"))
        return error(
          "rate_limited",
          "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          429,
        );
      if (reserveResult.error.message.includes("feedback_submission_conflict"))
        return error(
          "submission_conflict",
          "이미 사용된 제보 요청입니다.",
          409,
        );
      return error("delivery_failed", "제보를 접수하지 못했습니다.", 503);
    }
    const referenceId = `FB-${input.submissionId.slice(0, 8).toUpperCase()}`;
    if (!isRecord(reserveResult.data))
      return error("delivery_failed", "제보를 접수하지 못했습니다.", 503);
    const reservedStatus = getString(reserveResult.data, "status", "status");
    if (reservedStatus === "published") {
      const issueNumber = getNumber(
        reserveResult.data,
        "issueNumber",
        "issue_number",
      );
      const issueUrl = getString(reserveResult.data, "issueUrl", "issue_url");
      if (!issueNumber || !issueUrl)
        return error("delivery_failed", "제보를 접수하지 못했습니다.", 503);
      return json({
        accepted: true,
        status: "published",
        referenceId,
        issueNumber,
        issueUrl,
      });
    }
    const deliveryToken = crypto.randomUUID();
    const claimResult = await dependencies.rpc(
      "claim_feedback_delivery_internal",
      {
        p_submission_id: input.submissionId,
        p_payload_hash: payloadHash,
        p_delivery_token: deliveryToken,
        p_lease_seconds: 60,
      },
    );
    if (claimResult.error) {
      if (claimResult.error.message.includes("feedback_submission_conflict"))
        return error(
          "submission_conflict",
          "이미 사용된 제보 요청입니다.",
          409,
        );
      return error("delivery_failed", "제보를 접수하지 못했습니다.", 503);
    }
    const claim = parseClaim(claimResult.data, deliveryToken, referenceId);
    if (!claim)
      return error("delivery_failed", "제보를 접수하지 못했습니다.", 503);
    if (claim.action === "published")
      return json({
        accepted: true,
        status: "published",
        referenceId: claim.referenceId,
        issueNumber: claim.issueNumber,
        issueUrl: claim.issueUrl,
      });
    if (claim.action === "in_progress")
      return json({
        accepted: true,
        status: "in_progress",
        referenceId: claim.referenceId,
      });
    const marker = `<!-- busu-feedback:${input.submissionId} -->`;
    if (claim.action === "reconcile") {
      try {
        const response = await dependencies.fetch(
          `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${githubRepository} in:body "busu-feedback:${input.submissionId}"`)}&per_page=10`,
          { headers: githubHeaders(githubToken), signal: githubSignal() },
        );
        if (!response.ok) {
          await recordFailure(
            dependencies.rpc,
            input.submissionId,
            claim.deliveryToken as string,
            "reconciliation_unavailable",
            true,
          );
          return json(
            {
              accepted: true,
              status: "delivery_unknown",
              referenceId: claim.referenceId,
            },
            202,
          );
        }
        const value: unknown = await response.json();
        const candidates =
          isRecord(value) && Array.isArray(value.items) ? value.items : [];
        const match = candidates.find(
          (candidate) =>
            isRecord(candidate) &&
            typeof candidate.body === "string" &&
            candidate.body.includes(marker),
        );
        const issue = parsePublishedIssue(match, githubRepository);
        if (issue) return finish(dependencies.rpc, input, claim, issue);
        await recordFailure(
          dependencies.rpc,
          input.submissionId,
          claim.deliveryToken as string,
          "reconciliation_not_found",
          true,
        );
        return json(
          {
            accepted: true,
            status: "delivery_unknown",
            referenceId: claim.referenceId,
          },
          202,
        );
      } catch {
        await recordFailure(
          dependencies.rpc,
          input.submissionId,
          claim.deliveryToken as string,
          "reconciliation_unavailable",
          true,
        );
        return json(
          {
            accepted: true,
            status: "delivery_unknown",
            referenceId: claim.referenceId,
          },
          202,
        );
      }
    }
    try {
      const content = githubContent(input, userAgent, claim.referenceId);
      const response = await dependencies.fetch(
        `https://api.github.com/repos/${githubRepository}/issues`,
        {
          method: "POST",
          headers: githubHeaders(githubToken),
          body: JSON.stringify(content),
          signal: githubSignal(),
        },
      );
      if (!response.ok) {
        await recordFailure(
          dependencies.rpc,
          input.submissionId,
          claim.deliveryToken as string,
          "github_rejected",
          false,
        );
        return json(
          {
            code: "delivery_failed",
            message: "제보 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          },
          502,
        );
      }
      const issue = parsePublishedIssue(
        await response.json(),
        githubRepository,
      );
      if (!issue) throw new Error("ambiguous_response");
      return finish(dependencies.rpc, input, claim, issue);
    } catch {
      await recordFailure(
        dependencies.rpc,
        input.submissionId,
        claim.deliveryToken as string,
        "delivery_unknown",
        true,
      );
      return json(
        {
          accepted: true,
          status: "delivery_unknown",
          referenceId: claim.referenceId,
        },
        202,
      );
    }
  };
}
