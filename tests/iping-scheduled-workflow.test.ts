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
  it("runs one bounded browser worker on main every ten minutes", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toContain('cron: "*/10 * * * *"');
    expect(workflow).toContain('run: test "$GITHUB_REF" = "refs/heads/main"');
    expect(workflow).toContain("needs: branch-guard");
    expect(workflow).toContain(
      "if: needs.branch-guard.result == 'success' && github.ref == 'refs/heads/main'",
    );
    expect(workflow).toContain("group: iping-refresh-worker");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("actions/checkout@v4");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("runs-on: [self-hosted, Linux, ARM64, iping]");
    expect(workflow).toContain("IPING_BROWSER_EXECUTABLE: /usr/bin/chromium");
    expect(workflow).toContain('test "$RUNNER_OS" = "Linux"');
    expect(workflow).toContain('test -x "$IPING_BROWSER_EXECUTABLE"');
    expect(workflow).toContain("pnpm iping:worker --mode drain-iping");
    expect(workflow).not.toContain("curl");

    const workerJob = workflow.slice(workflow.indexOf("  drain:"));
    expect(workerJob).not.toContain("runs-on: ubuntu-latest");
  });

  it("allows an explicit manual recovery without changing the scheduled drain", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toMatch(
      /workflow_dispatch:[\s\S]+?mode:[\s\S]+?type: choice[\s\S]+?drain-iping[\s\S]+?recover-iping/u,
    );
    expect(workflow).toContain("github.event_name == 'schedule'");
    expect(workflow).toContain("inputs.mode == 'drain-iping'");
    expect(workflow).toContain("inputs.mode == 'recover-iping'");
    expect(workflow).toContain("pnpm iping:worker --mode recover-iping");
    expect(workflow).not.toMatch(/iping:worker[^\n]*inputs\.mode/u);
  });

  it("retries iPing protection hourly instead of waiting for a deployment", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toContain('cron: "5 * * * *"');
    expect(workflow).toContain(
      "if: github.event_name == 'schedule' && github.event.schedule == '*/10 * * * *'",
    );
    expect(workflow).toMatch(
      /Recover iPing protection once an hour[\s\S]+?github\.event\.schedule == '5 \* \* \* \*'[\s\S]+?iping:worker --mode recover-iping/u,
    );
  });

  it("recovers once after a successful main Supabase deployment", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("workflows: [Deploy Supabase backend]");
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(workflow).toContain(
      "github.event.workflow_run.head_branch == 'main'",
    );
    expect(workflow).toContain("github.event.workflow_run.head_sha");
    expect(workflow).toContain(
      "Recover iPing after a successful backend deployment",
    );
    expect(workflow).toMatch(
      /Recover iPing after a successful backend deployment[\s\S]+?github\.event_name == 'workflow_run'[\s\S]+?iping:worker --mode recover-iping/u,
    );
  });

  it("keeps credentials in the protected worker job only", () => {
    const workflow = readFileSync(scheduledWorkflowPath, "utf8");

    expect(workflow).toContain(
      "REFRESH_WORKER_TOKEN: ${{ secrets.REFRESH_WORKER_TOKEN }}",
    );
    expect(workflow).toContain(
      "SUPABASE_PROJECT_ID: ${{ vars.SUPABASE_PROJECT_ID }}",
    );
    expect(workflow).toContain('test "${#REFRESH_WORKER_TOKEN}" -eq 64');
    expect(workflow).toContain("*[!0-9a-fA-F]*) exit 1");
    expect(workflow).toContain("IPING_USERNAME: ${{ secrets.IPING_USERNAME }}");
    expect(workflow).toContain("IPING_PASSWORD: ${{ secrets.IPING_PASSWORD }}");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toMatch(/echo[^\n]*IPING_(?:USERNAME|PASSWORD)/u);

    const guardJob = workflow.slice(
      workflow.indexOf("  branch-guard:"),
      workflow.indexOf("  drain:"),
    );
    expect(guardJob).not.toContain("REFRESH_WORKER_TOKEN");
    expect(guardJob).not.toContain("SUPABASE_PROJECT_ID");
    expect(guardJob).not.toContain("IPING_USERNAME");
    expect(guardJob).not.toContain("IPING_PASSWORD");
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
    expect(deploymentWorkflow).not.toContain("IPING_USERNAME");
    expect(deploymentWorkflow).not.toContain("IPING_PASSWORD");
    expect(deploymentWorkflow).not.toContain(
      "Recover iPing after credential rotation",
    );
  });
});
