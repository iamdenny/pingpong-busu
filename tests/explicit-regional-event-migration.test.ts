import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608150003_explicit_regional_events.sql",
  ),
  "utf8",
);

describe("explicit regional event migration", () => {
  it("prioritizes event-local regional evidence before women and transition inference", () => {
    expect(migration).toContain("v_explicit_regional_event boolean");
    expect(migration).toContain(
      "if v_explicit_regional_event\n     or v_evidence ~ '지역[[:space:]]*부수' then",
    );
    expect(migration.indexOf("if v_explicit_regional_event")).toBeLessThan(
      migration.indexOf("when v_evidence ~ '(여자|여성)'"),
    );
    expect(migration.indexOf("p_observed_system = 'division'")).toBeLessThan(
      migration.indexOf("if v_explicit_regional_event"),
    );
    expect(migration.indexOf("p_observed_system = 'division'")).toBeLessThan(
      migration.indexOf("제([1-9]|1[0-8])회분당구청장기"),
    );
  });

  it("normalizes matching evidence without mutating source observations", () => {
    expect(migration).toContain(
      "v_event text := normalize(coalesce(p_event_name, ''), NFKC)",
    );
    expect(migration).toContain("v_event ~*");
    expect(migration).not.toContain("update public.results");
    expect(migration).not.toContain("set division_system = 'regional'");
  });

  it("keeps the public function contract and grants", () => {
    expect(migration).toContain(
      "create or replace function public.effective_division_system(",
    );
    expect(migration).toContain(
      "grant execute on function public.effective_division_system(text, text, text, text, date, text) to anon, authenticated, service_role",
    );
  });
});
