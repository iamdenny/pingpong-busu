import { describe, expect, it, vi } from "vitest";
import {
  installRuntimeIncidentListeners,
  runtimeIncidentInput,
  runtimeRoute,
  type RuntimeIncidentRepository,
} from "./runtime-incident-repository";

describe("runtime incident reporting", () => {
  it("builds an allow-listed payload without query, hash query, message, or stack", () => {
    const location = new URL(
      "https://busu.example/search?name=홍길동#/players/7?token=secret",
    ) as unknown as Location;
    const input = runtimeIncidentInput("render_error", "2026.33.44", location);

    expect(input).toMatchObject({
      category: "render_error",
      appVersion: "2026.33.44",
      route: "/players/:id",
    });
    expect(JSON.stringify(input)).not.toContain("홍길동");
    expect(JSON.stringify(input)).not.toContain("secret");
    expect(Object.keys(input).sort()).toEqual([
      "appVersion",
      "category",
      "eventId",
      "route",
    ]);
  });

  it("normalizes malformed hash routes", () => {
    const location = new URL(
      "https://busu.example/base#token=secret",
    ) as unknown as Location;
    expect(runtimeRoute(location)).toBe("/unknown");
  });

  it("replaces a previous listener installation instead of duplicating reports", async () => {
    const first = vi
      .fn<RuntimeIncidentRepository["report"]>()
      .mockResolvedValue();
    const second = vi
      .fn<RuntimeIncidentRepository["report"]>()
      .mockResolvedValue();
    installRuntimeIncidentListeners({ report: first }, "2026.33.48");
    const uninstall = installRuntimeIncidentListeners(
      { report: second },
      "2026.33.48",
    );

    window.dispatchEvent(new ErrorEvent("error"));
    await Promise.resolve();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    uninstall();
  });

  it("reports global failures and cleanup prevents re-entry", async () => {
    const report = vi
      .fn<RuntimeIncidentRepository["report"]>()
      .mockResolvedValue();
    const uninstall = installRuntimeIncidentListeners({ report }, "2026.33.44");

    window.dispatchEvent(new ErrorEvent("error"));
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("secret"),
      }),
    );
    await Promise.resolve();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.map(([input]) => input.category)).toEqual([
      "uncaught_error",
      "unhandled_rejection",
    ]);

    uninstall();
    window.dispatchEvent(new ErrorEvent("error"));
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("swallows telemetry delivery failures", async () => {
    const report = vi
      .fn<RuntimeIncidentRepository["report"]>()
      .mockRejectedValue(new Error("offline"));
    const uninstall = installRuntimeIncidentListeners({ report }, "2026.33.44");
    window.dispatchEvent(new ErrorEvent("error"));
    await Promise.resolve();
    await Promise.resolve();
    expect(report).toHaveBeenCalledOnce();
    uninstall();
  });
});
