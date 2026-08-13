import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SourceRefreshProgress,
  sourceRefreshStateText,
  type SourceRefreshView,
} from "./SourceRefreshProgress";

describe("SourceRefreshProgress", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows aggregate and per-source live progress", () => {
    render(
      <SourceRefreshProgress
        sources={[
          {
            sourceCode: "astree",
            sourceName: "애즈트리",
            state: "succeeded",
            found: 4,
            inserted: 1,
          },
          {
            sourceCode: "ttadivision",
            sourceName: "대한탁구협회 디비전",
            state: "refreshing",
          },
          {
            sourceCode: "mytt",
            sourceName: "마이티티",
            state: "refreshing",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "3곳 중 1곳 완료 · 2곳 조회 중",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("애즈트리").closest("li")).toHaveTextContent(
      "완료 · 신규·변경 1건",
    );
    expect(screen.getByText("마이티티").closest("li")).toHaveTextContent(
      "조회 중",
    );
    expect(
      screen.getByRole("button", { name: "실시간 출처 조회 상세 접기" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses details when every source finishes and allows reopening", async () => {
    const refreshingSource: SourceRefreshView = {
      sourceCode: "astree",
      sourceName: "애즈트리",
      state: "refreshing",
    };
    const { rerender } = render(
      <SourceRefreshProgress sources={[refreshingSource]} />,
    );

    expect(screen.getByRole("list")).toBeVisible();

    rerender(
      <SourceRefreshProgress
        sources={[{ ...refreshingSource, state: "succeeded" }]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("list", { hidden: true })).not.toBeVisible(),
    );
    const toggle = screen.getByRole("button", {
      name: "실시간 출처 조회 상세 보기",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(screen.getByRole("list")).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it.each([
    ["source_timeout", "시간 초과"],
    ["source_blocked", "접근 차단"],
    ["source_schema_changed", "사이트 구조 변경"],
    ["source_auth_failed", "인증 실패"],
  ])("shows %s as its actual reason", (errorCode, label) => {
    expect(
      sourceRefreshStateText({
        sourceCode: "astree",
        sourceName: "애즈트리",
        state: "failed",
        errorCode,
      }),
    ).toBe(label);
  });

  it("marks a disabled source as integration off", () => {
    render(
      <SourceRefreshProgress
        sources={[
          {
            sourceCode: "iping",
            sourceName: "아이핑",
            state: "skipped",
            reason: "source_disabled",
          },
        ]}
      />,
    );
    expect(screen.getByText("아이핑").closest("li")).toHaveTextContent(
      "연동 꺼짐",
    );
    expect(
      screen.getByRole("heading", { name: "1곳 조회 완료 · 1곳 확인 필요" }),
    ).toBeInTheDocument();
  });

  it("counts down an automatic retry without announcing every tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    render(
      <SourceRefreshProgress
        sources={[
          {
            sourceCode: "astree",
            sourceName: "애즈트리",
            state: "waiting",
            reason: "source_rate_limited",
            retryAt: Date.now() + 2_500,
          },
        ]}
      />,
    );

    expect(screen.getByText("호출 제한 · 3초 후 자동 재시도")).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText("호출 제한 · 2초 후 자동 재시도")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1곳 중 0곳 완료 · 1곳 조회 중",
    );
  });
});
