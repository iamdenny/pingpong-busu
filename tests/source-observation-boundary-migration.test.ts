import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130005_source_observation_boundary.sql",
  ),
  "utf8",
);

const upsertFunction = migration.match(
  /create or replace function public\.upsert_source_records[\s\S]+?\$\$;\n/iu,
)?.[0];

describe("source observation boundary migration", () => {
  it("keeps source affiliations as observations instead of creating canonical clubs", () => {
    expect(upsertFunction).toBeDefined();
    expect(upsertFunction).not.toMatch(/insert\s+into\s+public\.clubs/iu);
    expect(upsertFunction).toContain(
      "insert into public.players(canonical_name,normalized_name,primary_region,identity_status)",
    );
    expect(upsertFunction).toContain("source_club_text");
    expect(upsertFunction).toContain("club_text");
  });

  it("preserves the service-role-only upsert contract", () => {
    expect(migration).toContain(
      "revoke all on function public.upsert_source_records(text,text,text,jsonb,text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.upsert_source_records(text,text,text,jsonb,text) to service_role",
    );
  });

  it("rejects preliminary-stage placements before accepting award labels", () => {
    expect(migration).toMatch(
      /when\s+[^\n]*(예선|조별)[\s\S]*?then false[\s\S]*?position\('우승'/u,
    );
    expect(migration).toContain("[123]위");
    expect(migration).toContain("(2|4)강");
    expect(migration).toContain("normalize(p_rank_text, NFKC)");
  });

  it("detaches only the known Airping contamination and preserves source evidence", () => {
    expect(migration).toContain("s.code = 'airping'");
    expect(migration).toContain("spi.source_club_text = '82개판5분전'");
    expect(migration).toContain("c.canonical_name = '82개판5분전'");
    expect(migration).toContain("set primary_club_id = null");
    expect(migration).toContain(
      "p.public_id = 'f66a6821-83a4-4fda-ac5f-7484b8f6bdad'::uuid",
    );
    expect(migration).toContain("p.identity_status = 'unreviewed'");
    expect(migration).toContain("returning c.id into v_contaminated_club_id");
    expect(migration).toContain("if v_contaminated_club_id is not null then");
    expect(migration).toMatch(
      /not exists\s*\([\s\S]*?from public\.players/iu,
    );
    expect(migration).toMatch(
      /not exists\s*\([\s\S]*?from public\.club_aliases/iu,
    );
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(results|source_player_identities|result_revisions)/iu,
    );
  });
});
