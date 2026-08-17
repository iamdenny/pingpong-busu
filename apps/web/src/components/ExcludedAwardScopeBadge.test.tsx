import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExcludedAwardScopeBadge } from "./ExcludedAwardScopeBadge";

describe("ExcludedAwardScopeBadge", () => {
  it("stays out of the way for an individual record", () => {
    const { container } = render(
      <ExcludedAwardScopeBadge event="[여자단식] 여자 4~6부" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("names the scope and why the record is left out", () => {
    render(<ExcludedAwardScopeBadge event="[여자단체] 여자 4~6부" />);

    const badge = screen.getByText("단체");
    expect(badge).toHaveAttribute(
      "title",
      "단체·복식·혼성 입상은 현재 추정 부수 집계에서 제외합니다.",
    );
  });

  it("falls back to the event type when the name has no scope word", () => {
    render(<ExcludedAwardScopeBadge event="오픈 4~6부" eventType="doubles" />);

    expect(screen.getByText("복식")).toBeInTheDocument();
  });
});
