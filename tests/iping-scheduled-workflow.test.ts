import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scheduledWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/crawl-scheduled.yml",
);
const deploymentWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy-supabase.yml"),
  "utf8",
);

describe("scheduled iPing worker workflow", () => {
  it("runs only the bounded main-branch drain request every ten minutes", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toContain('cron: "*/10 * * * *"');
    expect(workflow).toContain(
      'run: test "$GITHUB_REF" = "refs/heads/main"',
    );
    expect(workflow).toContain("needs: branch-guard");
    expect(workflow).toContain(
      "if: needs.branch-guard.result == 'success' && github.ref == 'refs/heads/main'",
    );
    expect(workflow).toContain("group: iping-refresh-worker");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("--max-time 60");
    expect(workflow).toContain("--fail");
    expect(workflow).toContain(`--data '{"mode":"drain-iping"}'`);
  });

  it("allows an explicit manual recovery without changing the scheduled drain", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toMatch(
      /workflow_dispatch:[\s\S]+?mode:[\s\S]+?type: choice[\s\S]+?drain-iping[\s\S]+?recover-iping/u,
    );
    expect(workflow).toContain("github.event_name == 'schedule'");
    expect(workflow).toContain("inputs.mode == 'drain-iping'");
    expect(workflow).toContain("inputs.mode == 'recover-iping'");
    expect(workflow).toContain(`--data '{"mode":"recover-iping"}'`);
    expect(workflow).not.toMatch(/--data[^\n]*inputs\.mode/u);
  });

  it("uses only the worker token and public project locator", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toContain(
      "REFRESH_WORKER_TOKEN: ${{ secrets.REFRESH_WORKER_TOKEN }}",
    );
    expect(workflow).toContain(
      "SUPABASE_PROJECT_ID: ${{ vars.SUPABASE_PROJECT_ID }}",
    );
    expect(workflow).toContain("authorization: Bearer $REFRESH_WORKER_TOKEN");
    expect(workflow).toContain('test "${#REFRESH_WORKER_TOKEN}" -eq 64');
    expect(workflow).toContain("*[!0-9a-fA-F]*) exit 1");
    expect(workflow).not.toContain("IPING_USERNAME");
    expect(workflow).not.toContain("IPING_PASSWORD");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).not.toContain("pnpm install");

    const guardJob = workflow.slice(
      workflow.indexOf("  branch-guard:"),
      workflow.indexOf("  drain:"),
    );
    expect(guardJob).not.toContain("REFRESH_WORKER_TOKEN");
    expect(guardJob).not.toContain("SUPABASE_PROJECT_ID");
  });
});

describe("iPing worker deployment", () => {
  it("requires and syncs the same worker token when iPing is enabled", () => {
    expect(deploymentWorkflow).toContain(
      "REFRESH_WORKER_TOKEN: ${{ secrets.REFRESH_WORKER_TOKEN }}",
    );
    expect(deploymentWorkflow).toMatch(
      /Validate iPing runtime credentials[\s\S]+?test "\$\{#REFRESH_WORKER_TOKEN\}" -eq 64/u,
    );
    expect(deploymentWorkflow).toContain("*[!0-9a-fA-F]*) exit 1");
    expect(deploymentWorkflow).toMatch(
      /Configure refresh worker token[\s\S]+?REFRESH_WORKER_TOKEN="\$REFRESH_WORKER_TOKEN"/u,
    );
  });
});
