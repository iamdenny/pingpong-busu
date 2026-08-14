// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  reportOperationalIncident,
  type OperationalIncidentRpc,
} from "../supabase/functions/_shared/operational-incidents";
import { createReportRuntimeIncidentHandler } from "../supabase/functions/report-runtime-incident/handler";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608140009_operational_incidents.sql",
  ),
  "utf8",
);
const input = {
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  category: "render_error" as const,
  appVersion: "2026.33.48",
  route: "/search",
};
const environment = {
  publishableKey: "public",
  runtimeIncidentAllowedOrigins: "https://busu.example",
};
const request = (body: unknown = input, headers: Record<string, string> = {}) =>
  new Request(
    "https://project.supabase.co/functions/v1/report-runtime-incident",
    {
      method: "POST",
      headers: {
        apikey: "public",
        origin: "https://busu.example",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );

describe("operational incident migration contract", () => {
  it("keeps aggregates, event replay keys, and publication budgets service-role-only", () => {
    expect(migration).toContain("operational_incidents");
    expect(migration).toContain("operational_incident_events");
    expect(migration).toContain("operational_incident_publication_budgets");
    expect(migration).toContain("operational_incident_ingestion_budgets");
    expect(migration).toMatch(
      /occurrence_count = public\.operational_incidents\.occurrence_count \+ 1/u,
    );
    expect(migration).toContain("v_incident.occurrence_count < 3");
    expect(migration).toContain("v_budget >= 5");
    expect(migration).toContain("event_count < 300");
    expect(migration).toContain("operational_incident_rate_limited");
    expect(migration).toContain("primary key (scope, window_started_at)");
    expect(migration).toContain(
      "case when p_category like 'source_%' then 'source' else 'browser' end",
    );
    expect(migration.match(/set search_path = public, pg_temp/g)).toHaveLength(
      5,
    );
    expect(migration).toContain("purge-expired-operational-incidents");
    expect(migration).toContain("cron.schedule");
    expect(migration).toMatch(
      /revoke all on function public\.reserve_operational_incident_internal/u,
    );
    expect(migration).toMatch(/to service_role/g);
    expect(migration).not.toContain("raw_stack");
    expect(migration).not.toContain("error_message");
  });
});

describe("runtime incident boundary", () => {
  it.each([
    [{ ...input, stack: "secret" }, 400],
    [{ ...input, route: "/player?q=name" }, 400],
    [{ ...input, route: "/player#token" }, 400],
    [{ ...input, route: "/players/JohnDoe" }, 400],
    [{ ...input, route: "/reset/eyJhbGciOiJIUzI1NiJ9" }, 400],
    [{ ...input, category: "source_timeout" }, 400],
    [{ ...input, appVersion: "test@example.com" }, 400],
  ])(
    "rejects unknown, sensitive, or ineligible browser payloads",
    async (body, status) => {
      const rpc = vi.fn();
      const response = await createReportRuntimeIncidentHandler({
        environment,
        rpc,
        fetch: vi.fn(),
      })(request(body));
      expect(response.status).toBe(status);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("requires both the publishable key and an allow-listed origin", async () => {
    const handler = createReportRuntimeIncidentHandler({
      environment,
      rpc: vi.fn(),
      fetch: vi.fn(),
    });
    expect((await handler(request(input, { apikey: "" }))).status).toBe(401);
    expect(
      (await handler(request(input, { origin: "https://evil.example" })))
        .status,
    ).toBe(403);
  });

  it("rejects request bodies above the fixed byte limit before RPC work", async () => {
    const rpc = vi.fn();
    const response = await createReportRuntimeIncidentHandler({
      environment,
      rpc,
      fetch: vi.fn(),
    })(
      request(input, {
        "content-length": "2048",
      }),
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a bounded rate-limit response without GitHub work", async () => {
    const fetchMock = vi.fn();
    const response = await createReportRuntimeIncidentHandler({
      environment,
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "operational_incident_rate_limited" },
      })),
      fetch: fetchMock,
    })(request());
    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses separate browser and trusted source budgets", () => {
    expect(migration).toContain(
      "where scope=v_scope and window_started_at=v_window",
    );
    expect(migration).toContain("values (v_scope, v_window, 1)");
  });
});

describe("operational incident delivery", () => {
  it("does not let arbitrary browser versions create new fingerprints", async () => {
    const rpc = vi.fn(async () => ({
      data: { status: "pending", claimed: false },
    }));
    const first = await reportOperationalIncident(input, {
      rpc,
      fetch: vi.fn(),
    });
    const second = await reportOperationalIncident(
      { ...input, appVersion: "9999.99.999" },
      { rpc, fetch: vi.fn() },
    );
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("aggregates and publishes a claimed incident with an exact marker", async () => {
    const rpc: OperationalIncidentRpc = vi.fn(async (name) =>
      name === "claim_operational_incident_delivery_internal"
        ? {
            data: {
              status: "delivering",
              claimed: true,
              previous_status: "pending",
            },
          }
        : { data: true },
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            number: 46,
            html_url: "https://github.com/iamdenny/pingpong-busu/issues/46",
          }),
          { status: 201 },
        ),
    );
    const result = await reportOperationalIncident(input, {
      rpc,
      fetch: fetchMock,
      githubRepository: "iamdenny/pingpong-busu",
      githubToken: "token",
    });
    expect(result.status).toBe("published");
    const requestBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    expect(typeof requestBody).toBe("string");
    const body = typeof requestBody === "string" ? requestBody : "";
    expect(body).toContain(`busu-operational-incident:${result.fingerprint}`);
    expect(body).not.toContain("stack");
  });

  it("reconciles an ambiguous delivery by exact fingerprint marker", async () => {
    const rpc: OperationalIncidentRpc = vi.fn(async (name) =>
      name === "claim_operational_incident_delivery_internal"
        ? {
            data: {
              status: "delivering",
              claimed: true,
              previous_status: "delivery_unknown",
            },
          }
        : { data: true },
    );
    const fingerprint = (
      await reportOperationalIncident(input, {
        rpc: vi.fn(async () => ({
          data: { status: "pending", claimed: false },
        })),
        fetch: vi.fn(),
      })
    ).fingerprint;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                number: 46,
                html_url: "https://github.com/iamdenny/pingpong-busu/issues/46",
                body: `<!-- busu-operational-incident:${fingerprint} -->`,
              },
            ],
          }),
        ),
    );
    expect(
      (
        await reportOperationalIncident(input, {
          rpc,
          fetch: fetchMock,
          githubRepository: "iamdenny/pingpong-busu",
          githubToken: "token",
        })
      ).status,
    ).toBe("published");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps GitHub delivery failure non-blocking and retryable", async () => {
    const rpc: OperationalIncidentRpc = vi.fn(async (name) =>
      name === "claim_operational_incident_delivery_internal"
        ? {
            data: {
              status: "delivering",
              claimed: true,
              previous_status: "pending",
            },
          }
        : { data: true },
    );
    const result = await reportOperationalIncident(input, {
      rpc,
      fetch: vi.fn(async () => new Response("no", { status: 503 })),
      githubRepository: "iamdenny/pingpong-busu",
      githubToken: "token",
    });
    expect(result).toMatchObject({ accepted: true, status: "recorded" });
    expect(rpc).toHaveBeenCalledWith(
      "mark_operational_incident_delivery_internal",
      expect.objectContaining({ p_outcome: "failed" }),
    );
  });

  it("does not leak a secondary delivery-state RPC rejection", async () => {
    const rpc: OperationalIncidentRpc = vi.fn(async (name) => {
      if (name === "claim_operational_incident_delivery_internal")
        return {
          data: {
            status: "delivering",
            claimed: true,
            previous_status: "pending",
          },
        };
      if (name === "mark_operational_incident_delivery_internal")
        throw new Error("database offline");
      return { data: true };
    });

    await expect(
      reportOperationalIncident(input, {
        rpc,
        fetch: vi.fn(async () => {
          throw new Error("network offline");
        }),
        githubRepository: "iamdenny/pingpong-busu",
        githubToken: "token",
      }),
    ).resolves.toMatchObject({ accepted: true, status: "delivery_unknown" });
  });

  it("reconciles when finalization returns false after GitHub accepted the issue", async () => {
    const rpc: OperationalIncidentRpc = vi.fn(async (name) => {
      if (name === "claim_operational_incident_delivery_internal")
        return {
          data: {
            status: "delivering",
            claimed: true,
            previous_status: "pending",
          },
        };
      if (name === "finalize_operational_incident_delivery_internal")
        return { data: false };
      return { data: true };
    });
    const result = await reportOperationalIncident(input, {
      rpc,
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              number: 46,
              html_url: "https://github.com/iamdenny/pingpong-busu/issues/46",
            }),
            { status: 201 },
          ),
      ),
      githubRepository: "iamdenny/pingpong-busu",
      githubToken: "token",
    });
    expect(result.status).toBe("delivery_unknown");
  });
});
