import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/202608260001_include_historical_regional_awards_in_search.sql",
  ),
  "utf8",
);

const expressionBetween = (start: string, end: string): string => {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return migration.slice(startIndex, endIndex);
};

const historicalPredicate = "public.is_historical_division_record(";
const futureDatePredicate =
  "r.tournament_date is null or r.tournament_date <= current_date";

describe("historical regional awards search migration", () => {
  it("includes historical awards while retaining future-date exclusion", () => {
    const resultCount = expressionBetween(
      "count(*) filter (",
      ")::integer result_count",
    );
    const awardResults = expressionBetween(
      "coalesce(jsonb_agg(",
      "), '[]'::jsonb) award_results",
    );

    for (const awardExpression of [resultCount, awardResults]) {
      expect(awardExpression).toContain("public.is_award_rank(r.rank_text)");
      expect(awardExpression).toContain(futureDatePredicate);
      expect(awardExpression).not.toContain(historicalPredicate);
    }
  });

  it("keeps historical records out of current and recent division summaries", () => {
    const recentDivision = expressionBetween(
      "(array_agg(\n    r.division_value",
      "))[1] recent_observed_division",
    );
    const recentDivisionSystem = expressionBetween(
      "(array_agg(\n    r.effective_division_system",
      "))[1] recent_observed_division_system",
    );
    const divisionObservations = expressionBetween(
      "coalesce((\n    select jsonb_agg(",
      "), '[]'::jsonb) division_observations",
    );

    for (const divisionExpression of [
      recentDivision,
      recentDivisionSystem,
      divisionObservations,
    ]) {
      expect(divisionExpression).toContain(historicalPredicate);
      expect(divisionExpression).toMatch(
        /tournament_date is null or r2?\.tournament_date <= current_date/u,
      );
    }
  });

  it("keeps historical records out of every latest participation expression", () => {
    const participationColumns = [
      "latest_participation_date",
      "latest_participation_tournament",
      "latest_participation_checked_at",
      "latest_participation_event",
    ] as const;
    const boundaries = [
      "max(r.sort_date) filter (",
      "(array_agg(r.tournament_name_text",
      "(array_agg(r.last_checked_at",
      "(array_agg(r.event_name",
    ] as const;

    participationColumns.forEach((column, index) => {
      const nextBoundary = boundaries[index + 1] ?? "from public.players p";
      const expression = expressionBetween(boundaries[index], nextBoundary);

      expect(expression).toContain(column);
      expect(expression).toContain("not public.is_award_rank(r.rank_text)");
      expect(expression).toContain(futureDatePredicate);
      expect(expression).toContain(historicalPredicate);
    });
  });

  it("preserves the grouped public view contract", () => {
    expect(migration).toContain(
      "create or replace view public.public_player_search with (security_invoker = true)",
    );
    expect(migration).toContain(
      "left join public.public_result_groups r on r.player_public_id = p.public_id",
    );
    expect(migration).toContain("'source_count', r.grouped_result_count");
    expect(migration).toContain(
      "comment on view public.public_player_search is",
    );
    expect(migration).toContain(
      "grant select on public.public_player_search to anon",
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
