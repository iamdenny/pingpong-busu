import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608130010_yongin_photo_board_cleanup.sql",
  ),
  "utf8",
);

describe("Yongin photo-board cleanup migration", () => {
  it("disputes inferred photo-board results and orphaned source identities", () => {
    expect(migration).toContain("source.code = 'yongintt'");
    expect(migration).toContain("record_status = 'disputed'");
    expect(migration).toContain("match_status = 'disputed'");
    expect(migration).toContain("/yongintt/iwou/%");
    expect(migration).toContain("입상자[[:space:]]*사진");
    expect(migration).toContain("parser_version = 'yongintt-2'");
  });

  it("retains the source audit trail", () => {
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(?:results|source_player_identities)/iu,
    );
  });
});
