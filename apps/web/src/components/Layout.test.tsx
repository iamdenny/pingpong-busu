import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { appVersion } from "../lib/appVersion";
import { Layout } from "./Layout";

// ScrollRestoration은 data router에서만 동작하므로 실제 구성과 같게 렌더한다.
function layoutRouter(route = "/") {
  return createMemoryRouter([{ path: "*", element: <Layout /> }], {
    initialEntries: [route],
  });
}

describe("Layout", () => {
  it("shows the demo mode banner, brand, and data policy", () => {
    const { container } = render(<RouterProvider router={layoutRouter()} />);

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
      screen.getByRole("button", { name: "문의·제보하기" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("라이선스는 아직 결정되지 않음"),
    ).not.toBeInTheDocument();
  });

  it("offers the search box beside the brand outside the home page", async () => {
    render(<RouterProvider router={layoutRouter("/players/player-1")} />);

    const header = document.querySelector(".site-header");
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByLabelText("선수 검색"),
    ).toBeInTheDocument();
    expect(
      within(header as HTMLElement).getByLabelText("BUSU 홈"),
    ).toBeInTheDocument();
  });

  it("carries the current query into the header search box", () => {
    render(<RouterProvider router={layoutRouter("/search?q=임대현")} />);

    expect(screen.getByLabelText("선수 검색")).toHaveValue("임대현");
  });

  it("leaves the home hero search alone", () => {
    render(<RouterProvider router={layoutRouter("/")} />);

    expect(screen.queryByLabelText("선수 검색")).not.toBeInTheDocument();
  });

  it.each(["/", "/search?q=임대현", "/players/player-1"])(
    "shows the compact version label on %s",
    (route) => {
      render(<RouterProvider router={layoutRouter(route)} />);

      expect(screen.getByText(`버전 ${appVersion}`)).toHaveClass("app-version");
    },
  );
});
