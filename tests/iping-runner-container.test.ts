import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(
  resolve(process.cwd(), "ops/iping-runner/Dockerfile"),
  "utf8",
);
const entrypoint = readFileSync(
  resolve(process.cwd(), "ops/iping-runner/entrypoint.sh"),
  "utf8",
);
const browserWorker = readFileSync(
  resolve(process.cwd(), "scripts/iping-browser-worker.ts"),
  "utf8",
);

describe("isolated iPing runner image", () => {
  it("pins and verifies the ARM64 runner and executes Chromium as non-root", () => {
    expect(dockerfile).toContain(
      "actions-runner-linux-arm64-${RUNNER_VERSION}",
    );
    expect(dockerfile).toContain("sha256sum --check --strict");
    expect(dockerfile).toContain("USER runner");
    expect(dockerfile).toContain("IPING_BROWSER_EXECUTABLE=/usr/bin/chromium");
    expect(browserWorker).toContain("chromiumSandbox: false");
  });

  it("accepts the one-time registration token only on standard input", () => {
    expect(entrypoint).toContain("IFS= read -rs registration_token");
    expect(entrypoint).toContain('--labels "$runner_labels"');
    expect(entrypoint).toContain("--disableupdate");
    expect(entrypoint).not.toMatch(/echo[^\n]*registration_token/u);
    expect(entrypoint).not.toContain("RUNNER_TOKEN");
  });
});
