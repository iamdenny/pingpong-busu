import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecentSearches } from "../lib/recentSearches";
import { SearchForm } from "./SearchForm";
describe("SearchForm", () => {
  beforeEach(() => window.localStorage.clear());
  it("submits and remembers a query", async () => {
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} />);
    await userEvent.type(screen.getByLabelText("선수 검색"), "김탁구");
    await userEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(onSearch).toHaveBeenCalledWith("김탁구");
    expect(loadRecentSearches()).toEqual(["김탁구"]);
  });
  it("announces an empty query", async () => {
    render(<SearchForm onSearch={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(screen.getByRole("alert")).toHaveTextContent("입력해 주세요");
    expect(loadRecentSearches()).toEqual([]);
  });
});
