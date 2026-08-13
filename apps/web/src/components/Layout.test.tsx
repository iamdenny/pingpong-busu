import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { appVersion } from "../lib/appVersion";
import { Layout } from "./Layout";

describe("Layout", () => {
  it("shows the demo mode banner, brand, and data policy", () => {
    const { container } = render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("현재 화면은 개발용 가상 데이터입니다."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("BUSU 홈")).toHaveTextContent(
      "BUSU탁구 기록 통합검색",
    );
    expect(container.querySelector(".brand img")?.getAttribute("src")).toMatch(
      /\/busu-logo\.png$/,
    );
    expect(
      screen.getByText(
        "공개 대회 기록을 출처와 함께 제공하며, 정정 요청은 근거 확인 후 반영합니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(`버전 ${appVersion}`)).toBeInTheDocument();
    expect(
      screen.queryByText("라이선스는 아직 결정되지 않음"),
    ).not.toBeInTheDocument();
  });

  it.each(["/", "/search?q=임대현", "/players/player-1"])(
    "shows the compact version label on %s",
    (route) => {
      render(
        <MemoryRouter initialEntries={[route]}>
          <Layout />
        </MemoryRouter>,
      );

      expect(screen.getByText(`버전 ${appVersion}`)).toHaveClass("app-version");
    },
  );
});
