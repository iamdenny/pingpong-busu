import { beforeEach, describe, expect, it } from "vitest";
import {
  ANONYMOUS_EDITOR_STORAGE_KEY,
  getAnonymousEditorId,
} from "./anonymousEditor";

describe("anonymousEditor", () => {
  beforeEach(() => window.localStorage.clear());

  it("creates and reuses a browser-local UUID without user input", () => {
    const generated = "00000000-0000-4000-8000-000000000123";
    const first = getAnonymousEditorId(window.localStorage, () => generated);
    const second = getAnonymousEditorId(window.localStorage, () => {
      throw new Error("should not create another id");
    });

    expect(first).toBe(generated);
    expect(second).toBe(generated);
    expect(window.localStorage.getItem(ANONYMOUS_EDITOR_STORAGE_KEY)).toBe(
      generated,
    );
  });

  it("replaces malformed stored values", () => {
    window.localStorage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, "5030");

    expect(
      getAnonymousEditorId(
        window.localStorage,
        () => "00000000-0000-4000-8000-000000000456",
      ),
    ).toBe("00000000-0000-4000-8000-000000000456");
  });
});
