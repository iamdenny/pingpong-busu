import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagesWorkflow = readFileSync(
  resolve(import.meta.dirname, "../.github/workflows/deploy-pages.yml"),
  "utf8",
);
const backendWorkflow = readFileSync(
  resolve(import.meta.dirname, "../.github/workflows/deploy-supabase.yml"),
  "utf8",
);

describe("production deployment ordering", () => {
  it("starts Pages only after a successful production backend workflow", () => {
    expect(pagesWorkflow).toContain("workflows: [Deploy Supabase backend]");
    expect(pagesWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(pagesWorkflow).not.toMatch(/push:\s*\{\s*branches:\s*\[main\]/u);
    expect(pagesWorkflow).not.toContain("workflow_dispatch:");
  });

  it("pins checkout and release to the triggering backend commit", () => {
    expect(pagesWorkflow).toContain(
      "github.event.workflow_run.head_sha",
    );
    expect(pagesWorkflow).toContain(
      "ref: ${{ needs.validate-ref.outputs.deploy-sha }}",
    );
    expect(pagesWorkflow).toContain('--target "$DEPLOY_SHA"');
    expect(pagesWorkflow).not.toContain('--target "$GITHUB_SHA"');
  });

  it("runs the public read gate immediately after migrations", () => {
    const migrationStep = backendWorkflow.indexOf(
      "supabase db push --linked\n",
    );
    const healthStep = backendWorkflow.indexOf(
      "node --import tsx scripts/check-public-read-health.ts",
    );
    expect(migrationStep).toBeGreaterThan(-1);
    expect(healthStep).toBeGreaterThan(migrationStep);
    expect(backendWorkflow).toContain("PUBLIC_READ_MAX_MS: \"2500\"");
  });
});
