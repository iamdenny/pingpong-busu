import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608140007_regional_division_backfill.sql",
  ),
  "utf8",
);

describe("regional division transition migration", () => {
  it("uses the approved regional cutoffs without rewriting source-observed rows", () => {
    expect(migration).toContain("date '2017-01-01'");
    expect(migration).toContain("date '2022-07-01'");
    expect(migration).toContain("effective_division_system");
    expect(migration).not.toContain("update public.results");
    expect(migration).not.toContain("insert into public.result_revisions");
  });

  it("keeps explicit systems and tournament overrides ahead of the date backfill", () => {
    expect(migration).toContain("v_evidence ~ '지역[[:space:]]*부수'");
    expect(migration).toContain(
      "v_evidence !~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)'",
    );
    expect(migration).toContain("v_evidence !~ '오픈'");
    expect(migration).toContain(
      "v_evidence ~ '([0-9]+|[A-Z])[[:space:]]*부(수)?'",
    );
    expect(migration).toContain("제([1-9]|1[0-8])회분당구청장기");
    expect(migration).toContain(
      "when value ~ '분당구' then '경기도 성남시 분당구'",
    );
    expect(migration).toContain(
      "if v_region = '경기도 성남시 분당구'",
    );
    expect(
      migration.indexOf("if v_region = '경기도 성남시 분당구'"),
    ).toBeGreaterThan(migration.indexOf("p_observed_system = 'division'"));
    expect(migration).toContain("and v_evidence !~ '오픈'");
    expect(migration).toContain(
      "and v_evidence !~ '통합[[:space:]]*(부수|[0-9]+[[:space:]]*부)'",
    );
    expect(migration).toContain("지역(남성|여성|혼성)?([[:space:]]*([0-9]+");
    expect(migration).toContain("[[:space:])\\]/·,&+-]|$)");
    expect(migration).toContain(
      "or (p_observed_system = 'open' and not v_local_event) then",
    );
    expect(migration).toContain("when v_local_event then 'integrated'");
  });

  it("exposes tournament region while excluding historical regional divisions from current summaries", () => {
    expect(migration).toContain("infer_division_tournament_region");
    expect(migration).toContain(
      "public.infer_division_tournament_region(r.tournament_name_text, r.event_name)",
    );
    expect(migration).not.toContain(
      "t.held_on,\n    case when source_meta.code = 'iping' then null else spi.source_region end",
    );
    expect(migration).not.toContain(
      "r.event_name,\n            case when source_meta.code = 'iping' then null else spi.source_region end",
    );
    expect(migration).toContain("and source_meta.code <> 'iping'");
    expect(migration).toContain(
      "public.is_historical_division_record(\n          effective.division_system",
    );
    expect(migration).toContain(
      "public.is_historical_division_record(\n             effective2.division_system",
    );
    expect(migration).toContain("award_results");
    expect(migration).toContain("latest_participation_tournament");
    expect(migration).toMatch(
      /is_historical_division_record[\s\S]*?latest_participation_tournament/u,
    );
    expect(migration).toMatch(
      /count\(distinct r\.id\) filter \([\s\S]*?is_historical_division_record[\s\S]*?\)::integer result_count/u,
    );
  });

  it("exposes only immutable classification helpers", () => {
    expect(migration).toContain("language sql\nimmutable");
    expect(migration).toContain("language plpgsql\nimmutable");
    expect(migration).toContain(
      "grant execute on function public.is_historical_division_record(text, date, text, text) to anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "grant execute on function public.effective_division_system(text, text, text, text, date, text) to anon, authenticated, service_role",
    );
  });
});
