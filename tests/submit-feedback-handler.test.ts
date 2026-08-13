import { describe, expect, it, vi } from "vitest";
import {
  createSubmitFeedbackHandler,
  type FeedbackRpc,
} from "../supabase/functions/submit-feedback/handler";

const submissionId = "123e4567-e89b-42d3-a456-426614174000";
const deliveryToken = "123e4567-e89b-42d3-a456-426614174001";
const validBody = {
  submissionId,
  category: "bug",
  message: "검색 결과가 제대로 표시되지 않습니다.",
  pageUrl: "https://busu.example/pingpong-busu/search?q=%EA%B9%80",
  appVersion: "2026.33.37",
  browserLanguage: "ko-KR",
  viewport: { width: 390, height: 844 },
  website: "",
};

const environment = {
  publishableKey: "public-key",
  serviceRoleKey: "service-role-key",
  githubRepository: "iamdenny/pingpong-busu",
  githubToken: "github-token",
  feedbackAllowedOrigins: "https://busu.example,http://localhost:5173",
};

function request(
  body: unknown = validBody,
  headers: Record<string, string> = {},
) {
  return new Request(
    "https://project.supabase.co/functions/v1/submit-feedback",
    {
      method: "POST",
      headers: {
        apikey: "public-key",
        "content-type": "application/json",
        origin: "https://busu.example",
        "user-agent": "Mozilla/5.0 Test Browser",
        "x-forwarded-for": "203.0.113.8",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

function rpcWithClaim(claim: Record<string, unknown>): FeedbackRpc {
  return vi.fn(async (name) => {
    if (name === "reserve_feedback_submission_internal")
      return { data: { created: true, status: "pending" } };
    if (name === "claim_feedback_delivery_internal") return { data: claim };
    return { data: true };
  });
}

describe("submit-feedback pure handler", () => {
  it("rejects a missing publishable key before persistence", async () => {
    const rpc = rpcWithClaim({ action: "deliver" });
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: vi.fn(),
    })(request(validBody, { apikey: "" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "unauthorized",
      message: "인증할 수 없습니다.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validBody, category: "other" }, 400, "invalid_request"],
    [{ ...validBody, message: "짧음" }, 400, "invalid_request"],
    [{ ...validBody, message: "가".repeat(2001) }, 400, "invalid_request"],
    [
      { ...validBody, pageUrl: "https://evil.example/a" },
      400,
      "invalid_request",
    ],
    [
      { ...validBody, pageUrl: "https://user:pass@busu.example/a" },
      400,
      "invalid_request",
    ],
    [
      { ...validBody, message: "연락처는 test@example.com 입니다." },
      400,
      "sensitive_content",
    ],
    [
      { ...validBody, message: "연락처는 010-1234-5678 입니다." },
      400,
      "sensitive_content",
    ],
    [
      { ...validBody, message: "연락처는 02-1234-5678 입니다." },
      400,
      "sensitive_content",
    ],
    [
      { ...validBody, message: "생일은 1990년 01월 02일입니다." },
      400,
      "sensitive_content",
    ],
    [
      { ...validBody, message: "주소는 서울특별시 중구 세종대로 110 입니다." },
      400,
      "sensitive_content",
    ],
  ])("rejects invalid or sensitive input", async (body, status, code) => {
    const rpc = rpcWithClaim({ action: "deliver" });
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: vi.fn(),
    })(request(body));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("removes query parameters from the public page URL", async () => {
    const rpc = rpcWithClaim({
      status: "delivering",
      claimed: true,
      previous_status: "pending",
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            number: 24,
            html_url: "https://github.com/iamdenny/pingpong-busu/issues/24",
          }),
          { status: 201 },
        ),
    );
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: fetchMock,
    })(request());
    expect(response.status).toBe(201);
    const githubRequest = fetchMock.mock.calls[0]?.[1];
    const githubBody = JSON.parse(String(githubRequest?.body)) as {
      body: string;
    };
    expect(githubBody.body).toContain(
      "페이지: https://busu.example/pingpong-busu/search",
    );
    expect(githubBody.body).not.toContain("?q=");
  });

  it("rejects sensitive data embedded in the page path", async () => {
    const rpc = rpcWithClaim({ action: "deliver" });
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: vi.fn(),
    })(
      request({
        ...validBody,
        pageUrl: "https://busu.example/pingpong-busu/test%40example.com",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "sensitive_content" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts a honeypot without persistence or GitHub delivery", async () => {
    const rpc = rpcWithClaim({ action: "deliver" });
    const fetchMock = vi.fn();
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: fetchMock,
    })(request({ ...validBody, website: "https://spam.example" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a safe rate-limit response from the reserve boundary", async () => {
    const rpc: FeedbackRpc = vi.fn(async () => ({
      data: null,
      error: { message: "feedback_rate_limited: internal database detail" },
    }));
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: vi.fn(),
    })(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "rate_limited" });
  });

  it("fails closed when the fixed GitHub repository configuration is invalid", async () => {
    const response = await createSubmitFeedbackHandler({
      environment: {
        ...environment,
        githubRepository: "https://github.com/iamdenny/pingpong-busu",
      },
      rpc: rpcWithClaim({
        claimed: true,
        status: "delivering",
        previous_status: "pending",
      }),
      fetch: vi.fn(),
    })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "server_not_configured",
    });
  });

  it("fails closed before delivery when the configured repository is not the fixed target", async () => {
    const fetchMock = vi.fn();
    const response = await createSubmitFeedbackHandler({
      environment: {
        ...environment,
        githubRepository: "someone/another-repository",
      },
      rpc: rpcWithClaim({
        claimed: true,
        status: "delivering",
        previous_status: "pending",
      }),
      fetch: fetchMock,
    })(request());
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when no allowed browser origin is configured", async () => {
    const response = await createSubmitFeedbackHandler({
      environment: { ...environment, feedbackAllowedOrigins: undefined },
      rpc: rpcWithClaim({
        claimed: true,
        status: "delivering",
        previous_status: "pending",
      }),
      fetch: vi.fn(),
    })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "server_not_configured",
    });
  });

  it("claims, formats, and publishes one GitHub issue using the request User-Agent", async () => {
    const rpc = rpcWithClaim({
      claimed: true,
      status: "delivering",
      previous_status: "pending",
      delivery_token: deliveryToken,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            number: 23,
            html_url: "https://github.com/iamdenny/pingpong-busu/issues/23",
          }),
          { status: 201 },
        ),
    );
    const body = {
      ...validBody,
      message: "# 제목\n@iamdenny <script>alert(1)</script>",
      currentUrl: validBody.pageUrl,
      language: validBody.browserLanguage,
      userAgent: "spoofed client value",
      pageUrl: undefined,
      browserLanguage: undefined,
    };
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: fetchMock,
    })(request(body));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      accepted: true,
      status: "published",
      referenceId: "FB-123E4567",
      issueNumber: 23,
      issueUrl: "https://github.com/iamdenny/pingpong-busu/issues/23",
    });
    const claimCall = vi.mocked(rpc).mock.calls[0];
    expect(claimCall?.[0]).toBe("reserve_feedback_submission_internal");
    expect(claimCall?.[1]).toMatchObject({
      p_submission_id: submissionId,
      p_user_agent: "Mozilla/5.0 Test Browser",
    });
    expect(JSON.stringify(claimCall?.[1])).not.toContain("203.0.113.8");
    const githubInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(typeof githubInit.body).toBe("string");
    const githubPayload = JSON.parse(
      typeof githubInit.body === "string" ? githubInit.body : "",
    ) as {
      title: string;
      body: string;
    };
    expect(githubPayload.body).toContain(
      `<!-- busu-feedback:${submissionId} -->`,
    );
    expect(githubPayload.body).toContain("Mozilla/5.0 Test Browser");
    expect(githubPayload.body).toContain("ko-KR");
    expect(githubPayload.body).toContain("390 × 844");
    expect(githubPayload.body).toContain("FB-123E4567");
    expect(githubPayload.body).not.toContain("@iamdenny");
    expect(githubPayload.body).not.toContain("<script>");
    expect(githubPayload.title).not.toContain("#");
    expect(vi.mocked(rpc).mock.calls.at(-1)?.[0]).toBe(
      "finalize_feedback_delivery_internal",
    );
  });

  it("marks a confirmed GitHub failure as retryable", async () => {
    const rpc = rpcWithClaim({
      claimed: true,
      status: "delivering",
      previous_status: "failed",
      delivery_token: deliveryToken,
    });
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: vi.fn(
        async () =>
          new Response("upstream detail must stay private", { status: 422 }),
      ),
    })(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "delivery_failed" });
    expect(vi.mocked(rpc).mock.calls.at(-1)).toEqual([
      "mark_feedback_delivery_internal",
      expect.objectContaining({
        p_outcome: "failed",
        p_error_code: "github_rejected",
      }),
    ]);
  });

  it("marks network failure unknown, then reconciles by marker without creating again", async () => {
    const firstRpc = rpcWithClaim({
      claimed: true,
      status: "delivering",
      previous_status: "pending",
      delivery_token: deliveryToken,
    });
    const firstFetch = vi.fn(async () => {
      throw new TypeError("network secret");
    });
    const firstResponse = await createSubmitFeedbackHandler({
      environment,
      rpc: firstRpc,
      fetch: firstFetch,
    })(request());
    expect(firstResponse.status).toBe(202);
    expect(await firstResponse.json()).toEqual({
      accepted: true,
      status: "delivery_unknown",
      referenceId: "FB-123E4567",
    });
    expect(vi.mocked(firstRpc).mock.calls.at(-1)).toEqual([
      "mark_feedback_delivery_internal",
      expect.objectContaining({
        p_outcome: "delivery_unknown",
        p_error_code: "delivery_unknown",
      }),
    ]);

    const reconcileRpc = rpcWithClaim({
      claimed: true,
      status: "delivering",
      previous_status: "delivery_unknown",
      delivery_token: deliveryToken,
    });
    const reconcileFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                number: 24,
                html_url: "https://github.com/iamdenny/pingpong-busu/issues/24",
                body: `ok\n<!-- busu-feedback:${submissionId} -->`,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const reconciled = await createSubmitFeedbackHandler({
      environment,
      rpc: reconcileRpc,
      fetch: reconcileFetch,
    })(request());
    expect(reconciled.status).toBe(200);
    expect(await reconciled.json()).toMatchObject({
      status: "published",
      issueNumber: 24,
    });
    expect(reconcileFetch).toHaveBeenCalledTimes(1);
    expect(reconcileFetch.mock.calls[0]?.[1]).not.toMatchObject({
      method: "POST",
    });
  });

  it("reconciles an expired delivering lease before any later create", async () => {
    const rpc = rpcWithClaim({
      claimed: true,
      status: "delivering",
      previous_status: "delivering",
      delivery_token: deliveryToken,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                number: 26,
                html_url: "https://github.com/iamdenny/pingpong-busu/issues/26",
                body: `ok\n<!-- busu-feedback:${submissionId} -->`,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: fetchMock,
    })(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "published",
      issueNumber: 26,
    });
    expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({ method: "POST" });
  });

  it("marks a GitHub publication with failed DB finalization as ambiguous", async () => {
    const rpc: FeedbackRpc = vi.fn(async (name) => {
      if (name === "reserve_feedback_submission_internal")
        return { data: { created: true, status: "pending" } };
      if (name === "claim_feedback_delivery_internal")
        return {
          data: {
            claimed: true,
            status: "delivering",
            previous_status: "pending",
          },
        };
      if (name === "finalize_feedback_delivery_internal")
        return { data: null, error: { message: "database unavailable" } };
      return { data: true };
    });
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              number: 27,
              html_url: "https://github.com/iamdenny/pingpong-busu/issues/27",
            }),
            { status: 201 },
          ),
      ),
    })(request());

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      status: "delivery_unknown",
    });
    expect(vi.mocked(rpc).mock.calls.at(-1)).toEqual([
      "mark_feedback_delivery_internal",
      expect.objectContaining({
        p_outcome: "delivery_unknown",
        p_error_code: "finalization_unknown",
      }),
    ]);
  });

  it("preserves an unresolved ambiguous delivery and never blind-creates", async () => {
    const rpc = rpcWithClaim({
      claimed: true,
      status: "delivering",
      previous_status: "delivery_unknown",
      delivery_token: deliveryToken,
    });
    const fetchMock = vi.fn(
      async () => new Response('{"items":[]}', { status: 200 }),
    );
    const response = await createSubmitFeedbackHandler({
      environment,
      rpc,
      fetch: fetchMock,
    })(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: true,
      status: "delivery_unknown",
      referenceId: "FB-123E4567",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rpc).mock.calls.at(-1)).toEqual([
      "mark_feedback_delivery_internal",
      expect.objectContaining({
        p_outcome: "delivery_unknown",
        p_error_code: "reconciliation_not_found",
      }),
    ]);
  });

  it.each([
    [
      {
        claimed: false,
        status: "published",
        issue_number: 25,
        issue_url: "https://github.com/iamdenny/pingpong-busu/issues/25",
      },
      "published",
    ],
    [{ claimed: false, status: "delivering" }, "in_progress"],
  ])(
    "returns idempotent claim state without GitHub access",
    async (claim, expectedStatus) => {
      const fetchMock = vi.fn();
      const response = await createSubmitFeedbackHandler({
        environment,
        rpc: rpcWithClaim(claim),
        fetch: fetchMock,
      })(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        accepted: true,
        status: expectedStatus,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
