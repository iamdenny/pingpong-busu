import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const developmentWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy-supabase-development.yml"),
  "utf8",
);
const productionWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy-supabase.yml"),
  "utf8",
);
const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");

function getJobEnvironment(workflow: string): string {
  return workflow.slice(
    workflow.indexOf("    env:"),
    workflow.indexOf("    steps:"),
  );
}

function getStep(workflow: string, name: string): string {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const nextStep = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, nextStep === -1 ? workflow.length : nextStep);
}

function getRunScript(step: string): string {
  const runBlock = step.match(/\n {8}run: \|\n([\s\S]+)/);
  expect(runBlock).not.toBeNull();

  return (runBlock?.[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

function getWorkflowSteps(workflow: string): string[] {
  const starts = [...workflow.matchAll(/^ {6}- /gm)].map(
    (match) => match.index,
  );

  return starts.map((start, index) =>
    workflow.slice(start, starts[index + 1] ?? workflow.length),
  );
}

describe("Supabase development deployment contract", () => {
  it("is manual, main-only, and guarded by an explicit confirmation", () => {
    expect(developmentWorkflow).toContain("workflow_dispatch:");
    expect(developmentWorkflow).not.toContain("workflow_run:");
    expect(developmentWorkflow).toContain("github.ref == 'refs/heads/main'");
    expect(developmentWorkflow).toContain(
      "inputs.confirmation == 'deploy-development'",
    );
    expect(developmentWorkflow).toContain("environment: development");
  });

  it("rejects the production project and verifies the development identity", () => {
    expect(developmentWorkflow).toContain("SUPABASE_PRODUCTION_PROJECT_ID");
    expect(developmentWorkflow).toContain(
      'test "$SUPABASE_PROJECT_ID" != "$SUPABASE_PRODUCTION_PROJECT_ID"',
    );
    expect(developmentWorkflow).toContain('.name == "pingpong-busu-dev"');
  });

  it("seeds only development and fixes every live source switch to false", () => {
    expect(developmentWorkflow).toContain(
      "supabase db push --linked --include-seed",
    );
    expect(productionWorkflow).not.toContain("--include-seed");
    expect(developmentWorkflow).toContain('CRAWL_LIVE="false"');

    const sourceFlags = developmentWorkflow.match(
      /CRAWLER_SOURCE_[A-Z_]+_ENABLED="false"/g,
    );
    expect(sourceFlags).toHaveLength(9);
    expect(developmentWorkflow).not.toContain("KAKAO_REST_API_KEY");
    expect(developmentWorkflow).not.toContain("IPING_USERNAME");
    expect(developmentWorkflow).not.toContain("IPING_PASSWORD");
  });

  it("keeps the Supabase PAT scoped to CLI steps", () => {
    const jobEnvironment = getJobEnvironment(developmentWorkflow);
    expect(jobEnvironment).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(developmentWorkflow).toContain(
      "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    );
  });

  it("pins third-party actions and the Supabase CLI immutably", () => {
    const actionReferences = developmentWorkflow.match(
      /uses: [^\s]+@([^\s]+)/g,
    );
    expect(actionReferences).not.toBeNull();
    expect(actionReferences).toHaveLength(4);
    for (const actionReference of actionReferences ?? []) {
      expect(actionReference).toMatch(/@[a-f0-9]{40}$/);
    }
    expect(developmentWorkflow).toContain("version: 2.114.0");
    expect(developmentWorkflow).not.toContain("version: latest");
  });
});

describe("Supabase production deployment contract", () => {
  it("validates the GitHub Issues token before every production mutation", () => {
    const validationStep = getStep(
      productionWorkflow,
      "Validate deployment configuration",
    );

    expect(validationStep).toContain(
      "FEEDBACK_GITHUB_TOKEN: ${{ secrets.FEEDBACK_GITHUB_TOKEN }}",
    );
    expect(validationStep).toContain('test -n "$FEEDBACK_GITHUB_TOKEN"');
    expect(validationStep).not.toContain(
      "${{ secrets.GITHUB_ISSUES_TOKEN }}",
    );
    expect(validationStep).not.toContain("continue-on-error:");

    const validationIndex = productionWorkflow.indexOf(
      "- name: Validate deployment configuration",
    );
    const mutationSteps = getWorkflowSteps(productionWorkflow).filter((step) =>
      /\bsupabase (?:link|db push|secrets set|functions deploy)\b/.test(step),
    );
    expect(mutationSteps.length).toBeGreaterThan(0);
    for (const mutationStep of mutationSteps) {
      expect(validationIndex).toBeLessThan(
        productionWorkflow.indexOf(mutationStep),
      );
    }
  });

  it("exits before deployment when the GitHub Issues token is empty", () => {
    const validationScript = getRunScript(
      getStep(productionWorkflow, "Validate deployment configuration"),
    );
    const missingTokenResult = spawnSync(
      "bash",
      ["-euo", "pipefail", "-c", validationScript],
      {
        env: {
          SUPABASE_ACCESS_TOKEN: "test-access-token",
          SUPABASE_PROJECT_ID: "test-project-id",
          FEEDBACK_GITHUB_TOKEN: "",
        },
      },
    );
    const configuredTokenResult = spawnSync(
      "bash",
      ["-euo", "pipefail", "-c", validationScript],
      {
        env: {
          SUPABASE_ACCESS_TOKEN: "test-access-token",
          SUPABASE_PROJECT_ID: "test-project-id",
          FEEDBACK_GITHUB_TOKEN: "test-issues-token",
        },
      },
    );

    expect(missingTokenResult.status).not.toBe(0);
    expect(configuredTokenResult.status).toBe(0);
  });

  it("keeps the GitHub Issues token out of the production job environment", () => {
    expect(getJobEnvironment(productionWorkflow)).not.toContain(
      "FEEDBACK_GITHUB_TOKEN",
    );
  });

  it("configures the validated token unconditionally before Edge deployment", () => {
    const configurationStep = getStep(
      productionWorkflow,
      "Configure GitHub Issues token",
    );

    expect(configurationStep).toContain(
      "FEEDBACK_GITHUB_TOKEN: ${{ secrets.FEEDBACK_GITHUB_TOKEN }}",
    );
    expect(configurationStep).toContain(
      'GITHUB_ISSUES_TOKEN="$FEEDBACK_GITHUB_TOKEN"',
    );
    expect(configurationStep).not.toContain("if:");
    expect(
      productionWorkflow.indexOf("- name: Configure GitHub Issues token"),
    ).toBeLessThan(productionWorkflow.indexOf("- name: Deploy Edge Functions"));
  });
});

describe("Supabase development seed contract", () => {
  it("disables every real source and enables only mock", () => {
    expect(seed).toContain("set enabled = (code = 'mock')");
  });

  it("is idempotent for synthetic clubs and players", () => {
    expect(seed).toContain("on conflict (normalized_name) do update");
    expect(seed).toContain("where not exists (");
    expect(seed).toContain("player.primary_club_id = club.id");
    expect(seed).not.toContain("player.merged_into_player_id is null");
  });

  it("contains only synthetic identity fields", () => {
    expect(seed).not.toMatch(/phone|email|birth|address|service_role/i);
  });
});
