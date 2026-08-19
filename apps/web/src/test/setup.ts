import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";

expect.extend(matchers);

afterEach(cleanup);

if (
  typeof HTMLDialogElement !== "undefined" &&
  !HTMLDialogElement.prototype.showModal
) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
}

if (
  typeof HTMLDialogElement !== "undefined" &&
  !HTMLDialogElement.prototype.close
) {
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom은 스크롤을 구현하지 않으므로 ScrollRestoration 경고만 막는다.
if (typeof window !== "undefined") {
  window.scrollTo = () => undefined;
}
