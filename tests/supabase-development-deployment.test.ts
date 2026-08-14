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
    const jobEnvironment = developmentWorkflow.slice(
      developmentWorkflow.indexOf("    env:"),
      developmentWorkflow.indexOf("    steps:"),
    );
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
