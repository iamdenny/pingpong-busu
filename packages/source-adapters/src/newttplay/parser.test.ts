import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SourceSchemaChangedError } from "@busu/crawler-core";
import { parseNewttplaySearchHtml } from "./parser";

const fixture = (name: string): string =>
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../../fixtures/sources/newttplay",
      name,
    ),
    "utf8",
  );

describe("NewTTPlay parser", () => {
  it("parses only exact-name synthetic result-table records", () => {
    const records = parseNewttplaySearchHtml(
      fixture("search-result.html"),
      "김탁구",
      "2026-08-14T00:00:00.000Z",
    );

    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({
      sourceCode: "newttplay",
      playerName: "김탁구",
      clubText: "합성핑퐁클럽",
      region: "경기도 성남시",
      tournamentName: "2026 성남시 합성 탁구대회",
      tournamentDate: "2026-08-01",
      eventType: "singles",
      divisionSystem: "integrated",
      divisionValue: "6부",
      rankText: "본선 3위",
    });
    expect(records[1]).toMatchObject({
      eventType: "doubles",
      rankText: "본선 16강",
    });
    expect(records[2]).toMatchObject({ eventType: "team", rankText: "우승" });
    expect(records[0]?.sourceUrl).toMatch(
      /^https:\/\/www\.newttplay\.co\.kr\/bbs\/board\.php\?/u,
    );
    expect(JSON.stringify(records)).not.toMatch(
      /02-0000-0000|operator@example\.invalid|가상로/u,
    );
  });

  it("returns empty results separately from structure changes", () => {
    expect(
      parseNewttplaySearchHtml(
        fixture("empty-result.html"),
        "김탁구",
        "2026-08-14T00:00:00.000Z",
      ),
    ).toEqual([]);
    expect(() =>
      parseNewttplaySearchHtml(
        "<html><body>탁구인검색 member_search</body></html>",
        "김탁구",
        "2026-08-14T00:00:00.000Z",
      ),
    ).toThrow(SourceSchemaChangedError);
  });

  it("rejects event links that leave the source origin", () => {
    const html = fixture("search-result.html").replace(
      "./board.php?bo_table=joiner&amp;gamecup_id=300&amp;p_gameid=401&amp;matchmethod=3",
      "https://example.invalid/player",
    );
    expect(() =>
      parseNewttplaySearchHtml(html, "김탁구", "2026-08-14T00:00:00.000Z"),
    ).toThrow(SourceSchemaChangedError);
  });
});
