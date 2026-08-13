import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  SourceRefreshProgress,
  sourceRefreshStateText,
  type SourceRefreshView,
} from "./SourceRefreshProgress";

let styleElement: HTMLStyleElement;
const globalStyles = readFileSync(
  resolve(import.meta.dirname, "../styles/global.css"),
  "utf8",
);

beforeAll(() => {
  styleElement = document.createElement("style");
  styleElement.textContent = globalStyles;
  document.head.append(styleElement);
});

afterAll(() => styleElement.remove());

describe("SourceRefreshProgress", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows aggregate and per-source live progress", () => {
    render(
      <SourceRefreshProgress
        existingRecordCount={0}
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
    expect(
      screen.getByRole("region", { name: /3곳 중 1곳 완료/ }),
    ).toHaveAttribute("data-refreshing", "true");
    expect(globalStyles).toContain(
      '.source-refresh-progress[data-refreshing="true"]::before',
    );
  });

  it("keeps ongoing source details collapsed when stored records exist", () => {
    render(
      <SourceRefreshProgress
        existingRecordCount={1}
        sources={[
          {
            sourceCode: "astree",
            sourceName: "애즈트리",
            state: "succeeded",
          },
          {
            sourceCode: "airping",
            sourceName: "에어핑퐁",
            state: "refreshing",
          },
          {
            sourceCode: "iping",
            sourceName: "아이핑",
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
    expect(
      screen.getByRole("button", { name: "실시간 출처 조회 상세 보기" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("list", { hidden: true })).not.toBeVisible();
  });

  it("opens ongoing details after stored-record loading resolves empty", () => {
    const source: SourceRefreshView = {
      sourceCode: "astree",
      sourceName: "애즈트리",
      state: "refreshing",
    };
    const { rerender } = render(
      <SourceRefreshProgress existingRecordCount={null} sources={[source]} />,
    );

    expect(screen.getByRole("list", { hidden: true })).not.toBeVisible();

    rerender(
      <SourceRefreshProgress existingRecordCount={0} sources={[source]} />,
    );

    expect(screen.getByRole("list")).toBeVisible();
  });

  it.each([0, 1])(
    "preserves a manual toggle when stored-record loading resolves to %i records",
    (existingRecordCount) => {
      const source: SourceRefreshView = {
        sourceCode: "astree",
        sourceName: "애즈트리",
        state: "refreshing",
      };
      const { rerender } = render(
        <SourceRefreshProgress
          existingRecordCount={null}
          searchKey="임대현"
          sources={[source]}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: "실시간 출처 조회 상세 보기",
        }),
      );

      rerender(
        <SourceRefreshProgress
          existingRecordCount={existingRecordCount}
          searchKey="임대현"
          sources={[source]}
        />,
      );

      expect(screen.getByRole("list")).toBeVisible();
      expect(
        screen.getByRole("button", {
          name: "실시간 출처 조회 상세 접기",
        }),
      ).toHaveAttribute("aria-expanded", "true");
    },
  );

  it("resets the disclosure default when the search changes", () => {
    const source: SourceRefreshView = {
      sourceCode: "astree",
      sourceName: "애즈트리",
      state: "refreshing",
    };
    const { rerender } = render(
      <SourceRefreshProgress
        existingRecordCount={0}
        searchKey="임대현"
        sources={[source]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "실시간 출처 조회 상세 접기",
      }),
    );
    expect(screen.getByRole("list", { hidden: true })).not.toBeVisible();

    rerender(
      <SourceRefreshProgress
        existingRecordCount={0}
        searchKey="김탁구"
        sources={[source]}
      />,
    );

    expect(screen.getByRole("list")).toBeVisible();
  });

  it("collapses details when every source finishes and allows reopening", async () => {
    const refreshingSource: SourceRefreshView = {
      sourceCode: "astree",
      sourceName: "애즈트리",
      state: "refreshing",
    };
    const { rerender } = render(
      <SourceRefreshProgress
        existingRecordCount={0}
        sources={[refreshingSource]}
      />,
    );

    expect(screen.getByRole("list")).toBeVisible();

    rerender(
      <SourceRefreshProgress
        existingRecordCount={0}
        sources={[{ ...refreshingSource, state: "succeeded" }]}
      />,
    );

    const details = document.getElementById("source-refresh-details");
    expect(details).not.toBeNull();
    await waitFor(() =>
      expect(details).toHaveAttribute("data-expanded", "false"),
    );
    expect(details).toHaveAttribute("aria-hidden", "true");
    expect(details).toHaveAttribute("inert");
    const collapsedStyle = window.getComputedStyle(details!);
    expect(collapsedStyle.gridTemplateRows).toBe("0fr");
    expect(globalStyles).toContain("grid-template-rows 240ms ease");
    const toggle = screen.getByRole("button", {
      name: "실시간 출처 조회 상세 보기",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(screen.getByRole("list")).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(details).toHaveAttribute("data-expanded", "true");
    expect(details).toHaveAttribute("aria-hidden", "false");
    expect(details).not.toHaveAttribute("inert");
    expect(window.getComputedStyle(details!).gridTemplateRows).toBe("1fr");
  });

  it("starts collapsed during refresh when stored results already exist", () => {
    render(
      <SourceRefreshProgress
        sources={[
          {
            sourceCode: "astree",
            sourceName: "애즈트리",
            state: "refreshing",
          },
        ]}
        existingRecordCount={1}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "실시간 출처 조회 상세 보기",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("progressbar", {
        name: "출처 조회 진행률: 1곳 중 0곳 완료",
      }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(
      screen.getByRole("progressbar", {
        name: "출처 조회 진행률: 1곳 중 0곳 완료",
      }),
    ).toHaveAttribute("aria-valuemax", "1");
    expect(
      screen.getByRole("region", { name: /1곳 중 0곳 완료/ }),
    ).toHaveAttribute("data-refreshing", "true");
    expect(globalStyles).toContain("animation: source-card-scan 2.8s");
    expect(globalStyles).toContain(
      "animation: source-progress-flow 1.6s linear infinite",
    );
    expect(globalStyles).toContain(
      "transition: width 520ms cubic-bezier(0.22, 1, 0.36, 1)",
    );
    expect(globalStyles).toContain("background-position: 8rem 0");
    expect(globalStyles).toContain("var(--success) 0 3rem");
    expect(globalStyles).toContain("#68b8ac 3.75rem");
    expect(globalStyles).toContain("prefers-reduced-motion: reduce");
    expect(document.getElementById("source-refresh-details")).toHaveAttribute(
      "inert",
    );

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      document.getElementById("source-refresh-details"),
    ).not.toHaveAttribute("inert");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("smoothly advances the collapsed progress fill as sources finish", () => {
    const sources: SourceRefreshView[] = [
      {
        sourceCode: "astree",
        sourceName: "애즈트리",
        state: "refreshing",
      },
      {
        sourceCode: "mytt",
        sourceName: "마이티티",
        state: "refreshing",
      },
    ];
    const { rerender } = render(
      <SourceRefreshProgress sources={sources} existingRecordCount={1} />,
    );

    expect(
      document.querySelector(".source-refresh-progress__meter-fill"),
    ).toHaveStyle({ width: "0%" });

    rerender(
      <SourceRefreshProgress
        sources={[{ ...sources[0]!, state: "succeeded" }, sources[1]!]}
        existingRecordCount={1}
      />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(
      document.querySelector(".source-refresh-progress__meter-fill"),
    ).toHaveStyle({ width: "50%" });
  });

  it("collapses details when completion includes a failed source", async () => {
    const { rerender } = render(
      <SourceRefreshProgress
        existingRecordCount={0}
        sources={[
          {
            sourceCode: "astree",
            sourceName: "애즈트리",
            state: "refreshing",
          },
          {
            sourceCode: "airping",
            sourceName: "에어핑퐁",
            state: "refreshing",
          },
        ]}
      />,
    );

    rerender(
      <SourceRefreshProgress
        existingRecordCount={0}
        sources={[
          {
            sourceCode: "astree",
            sourceName: "애즈트리",
            state: "succeeded",
          },
          {
            sourceCode: "airping",
            sourceName: "에어핑퐁",
            state: "failed",
            errorCode: "source_timeout",
          },
        ]}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "실시간 출처 조회 상세 보기",
        }),
      ).toHaveAttribute("aria-expanded", "false"),
    );
    expect(
      screen.getByRole("heading", {
        name: "2곳 조회 완료 · 1곳 확인 필요",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { hidden: true })).not.toBeVisible();
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
        existingRecordCount={0}
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
        existingRecordCount={0}
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

  it("counts down an automatic timeout retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    render(
      <SourceRefreshProgress
        existingRecordCount={0}
        sources={[
          {
            sourceCode: "airping",
            sourceName: "에어핑퐁",
            state: "waiting",
            reason: "source_timeout",
            retryAt: Date.now() + 4_500,
          },
        ]}
      />,
    );

    expect(screen.getByText("시간 초과 · 5초 후 자동 재시도")).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText("시간 초과 · 4초 후 자동 재시도")).toBeVisible();
  });

  it("offers a bounded manual retry only after the cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    const onRetry = vi.fn();
    render(
      <SourceRefreshProgress
        existingRecordCount={0}
        sources={[
          {
            sourceCode: "airping",
            sourceName: "에어핑퐁",
            state: "failed",
            errorCode: "source_timeout",
            manualRetryAt: Date.now() + 5_000,
            manualRetriesRemaining: 3,
          },
        ]}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "실시간 출처 조회 상세 보기",
      }),
    );

    const button = screen.getByRole("button", {
      name: "에어핑퐁 재시도, 5초 후 가능",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    const availableButton = screen.getByRole("button", {
      name: "에어핑퐁 재시도, 3회 남음",
    });
    expect(availableButton).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(availableButton);
    expect(onRetry).toHaveBeenCalledWith("airping", Date.now());
  });

  it("keeps an exhausted retry button visible with its reason", () => {
    render(
      <SourceRefreshProgress
        existingRecordCount={0}
        sources={[
          {
            sourceCode: "iping",
            sourceName: "아이핑",
            state: "failed",
            manualRetryAt: 0,
            manualRetriesRemaining: 0,
          },
        ]}
        onRetry={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "실시간 출처 조회 상세 보기",
      }),
    );
    expect(
      screen.getByRole("button", { name: "아이핑 재시도, 한도 도달" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
