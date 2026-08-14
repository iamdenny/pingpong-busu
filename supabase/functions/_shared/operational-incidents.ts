export type OperationalIncidentCategory =
  | "source_schema_changed"
  | "source_auth_failed"
  | "render_error"
  | "uncaught_error"
  | "unhandled_rejection";
export type OperationalIncidentRpc = (
  name:
    | "reserve_operational_incident_internal"
    | "claim_operational_incident_delivery_internal"
    | "finalize_operational_incident_delivery_internal"
    | "mark_operational_incident_delivery_internal",
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error?: { message: string } | null }>;
export interface OperationalIncidentInput {
  eventId: string;
  category: OperationalIncidentCategory;
  appVersion: string;
  route?: string;
  sourceCode?: string;
  parserVersion?: string;
}
export interface OperationalIncidentDependencies {
  rpc: OperationalIncidentRpc;
  fetch: typeof fetch;
  githubRepository?: string;
  githubToken?: string;
}
const encoder = new TextEncoder();
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function digest(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function validRepository(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)
  );
}
function publishedIssue(value: unknown, repository: string) {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.number) ||
    typeof value.html_url !== "string"
  )
    return undefined;
  try {
    const url = new URL(value.html_url);
    if (
      url.origin !== "https://github.com" ||
      !url.pathname.startsWith(`/${repository}/issues/`)
    )
      return undefined;
  } catch {
    return undefined;
  }
  return { issueNumber: Number(value.number), issueUrl: value.html_url };
}
async function mark(
  dependencies: OperationalIncidentDependencies,
  fingerprint: string,
  token: string,
  outcome: "failed" | "delivery_unknown",
  code: string,
) {
  try {
    await dependencies.rpc("mark_operational_incident_delivery_internal", {
      p_fingerprint: fingerprint,
      p_delivery_token: token,
      p_outcome: outcome,
      p_error_code: code,
    });
  } catch {
    // Diagnostics delivery must remain best-effort for every caller.
  }
}
export async function reportOperationalIncident(
  input: OperationalIncidentInput,
  dependencies: OperationalIncidentDependencies,
): Promise<{ accepted: true; status: string; fingerprint: string }> {
  const fingerprint = await digest(
    JSON.stringify({
      category: input.category,
      appVersion: input.category.startsWith("source_")
        ? input.appVersion
        : null,
      route: input.route ?? null,
      sourceCode: input.sourceCode ?? null,
      parserVersion: input.parserVersion ?? null,
    }),
  );
  const reserved = await dependencies.rpc(
    "reserve_operational_incident_internal",
    {
      p_fingerprint: fingerprint,
      p_event_id: input.eventId,
      p_category: input.category,
      p_source_code: input.sourceCode ?? null,
      p_route: input.route ?? null,
      p_app_version: input.appVersion,
      p_parser_version: input.parserVersion ?? null,
    },
  );
  if (reserved.error)
    return {
      accepted: true,
      status: reserved.error.message.includes(
        "operational_incident_rate_limited",
      )
        ? "rate_limited"
        : "recording_failed",
      fingerprint,
    };
  const token = crypto.randomUUID();
  const claim = await dependencies.rpc(
    "claim_operational_incident_delivery_internal",
    {
      p_fingerprint: fingerprint,
      p_delivery_token: token,
      p_lease_seconds: 60,
    },
  );
  if (
    claim.error ||
    !isRecord(claim.data) ||
    claim.data.status !== "delivering" ||
    claim.data.claimed !== true
  )
    return {
      accepted: true,
      status:
        isRecord(claim.data) && typeof claim.data.status === "string"
          ? claim.data.status
          : "recorded",
      fingerprint,
    };
  if (
    !validRepository(dependencies.githubRepository) ||
    !dependencies.githubToken
  ) {
    await mark(
      dependencies,
      fingerprint,
      token,
      "failed",
      "publisher_not_configured",
    );
    return { accepted: true, status: "recorded", fingerprint };
  }
  const repository = dependencies.githubRepository;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${dependencies.githubToken}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };
  try {
    let issue;
    if (claim.data.previous_status === "delivery_unknown") {
      const marker = `busu-operational-incident:${fingerprint}`;
      const response = await dependencies.fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repository} in:body "${marker}"`)}&per_page=10`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      const value: unknown = response.ok ? await response.json() : undefined;
      issue =
        isRecord(value) && Array.isArray(value.items)
          ? value.items
              .filter(
                (item) =>
                  isRecord(item) &&
                  typeof item.body === "string" &&
                  item.body.includes(
                    `<!-- busu-operational-incident:${fingerprint} -->`,
                  ),
              )
              .map((item) => publishedIssue(item, repository))
              .find(Boolean)
          : undefined;
      if (!issue) {
        await mark(
          dependencies,
          fingerprint,
          token,
          "delivery_unknown",
          "reconciliation_not_found",
        );
        return { accepted: true, status: "delivery_unknown", fingerprint };
      }
    } else {
      const scope = input.sourceCode ? `출처 ${input.sourceCode}` : "브라우저";
      const body = [
        `<!-- busu-operational-incident:${fingerprint} -->`,
        "",
        "## 자동 감지 정보",
        "",
        `- 범주: ${input.category}`,
        `- 앱 버전: ${input.appVersion}`,
        ...(input.sourceCode ? [`- 출처: ${input.sourceCode}`] : []),
        ...(input.parserVersion ? [`- 파서 버전: ${input.parserVersion}`] : []),
        ...(input.route ? [`- 경로: ${input.route}`] : []),
        `- Fingerprint: ${fingerprint}`,
        "",
        "_허용된 운영 메타데이터만 포함한 자동 이슈입니다._",
      ].join("\n");
      const response = await dependencies.fetch(
        `https://api.github.com/repos/${repository}/issues`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: `[BUSU][자동 감지][${scope}] ${input.category}`,
            body,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      issue = response.ok
        ? publishedIssue(await response.json(), repository)
        : undefined;
      if (!issue) {
        await mark(
          dependencies,
          fingerprint,
          token,
          "failed",
          "github_rejected",
        );
        return { accepted: true, status: "recorded", fingerprint };
      }
    }
    const final = await dependencies.rpc(
      "finalize_operational_incident_delivery_internal",
      {
        p_fingerprint: fingerprint,
        p_delivery_token: token,
        p_issue_number: issue.issueNumber,
        p_issue_url: issue.issueUrl,
      },
    );
    if (final.error || final.data !== true) {
      await mark(
        dependencies,
        fingerprint,
        token,
        "delivery_unknown",
        "finalization_unknown",
      );
      return { accepted: true, status: "delivery_unknown", fingerprint };
    }
    return { accepted: true, status: "published", fingerprint };
  } catch {
    await mark(
      dependencies,
      fingerprint,
      token,
      "delivery_unknown",
      "github_delivery_unknown",
    );
    return { accepted: true, status: "delivery_unknown", fingerprint };
  }
}
