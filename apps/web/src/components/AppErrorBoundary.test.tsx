import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeIncidentRepository } from "../lib/runtime-incident-repository";
import { AppErrorBoundary, AppRouteError } from "./AppErrorBoundary";

function Broken(): never {
  throw new Error("player-name-secret");
}

describe("AppErrorBoundary", () => {
  it("reports route render failures and shows the recovery action", async () => {
    const repository = { report: vi.fn().mockResolvedValue(undefined) };
    render(<AppRouteError repository={repository} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "화면을 표시하지 못했습니다",
    );
    expect(repository.report).toHaveBeenCalledWith(
      expect.objectContaining({ category: "render_error" }),
    );
  });

  it("renders a Korean recovery screen and reports only a sanitized event", async () => {
    const report = vi
      .fn<RuntimeIncidentRepository["report"]>()
      .mockResolvedValue();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <AppErrorBoundary repository={{ report }}>
        <Broken />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "화면을 표시하지 못했습니다",
    );
    expect(report).toHaveBeenCalledOnce();
    expect(JSON.stringify(report.mock.calls[0]?.[0])).not.toContain(
      "player-name-secret",
    );
  });

  it("keeps the recovery UI usable when reporting fails", async () => {
    const report = vi
      .fn<RuntimeIncidentRepository["report"]>()
      .mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <AppErrorBoundary repository={{ report }}>
        <Broken />
      </AppErrorBoundary>,
    );

    expect(
      screen
        .getByRole("button", { name: "다시 불러오기" })
        .hasAttribute("disabled"),
    ).toBe(false);
    await Promise.resolve();
    expect(report).toHaveBeenCalledOnce();
  });
});
