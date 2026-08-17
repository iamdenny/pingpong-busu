import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SourceSchemaChangedError } from "@busu/crawler-core";
import { parseIpingSearchHtml } from "./parser";

const fixtureDirectory = resolve(
  import.meta.dirname,
  "../../../../fixtures/sources/iping",
);
const awardsFixture = readFileSync(
  resolve(fixtureDirectory, "awards.html"),
  "utf8",
);
const entriesFixture = readFileSync(
  resolve(fixtureDirectory, "entries.html"),
  "utf8",
);
const entriesWithSpacerFixture = readFileSync(
  resolve(fixtureDirectory, "entries-spacer.html"),
  "utf8",
);
const emptyEntriesFixture = readFileSync(
  resolve(fixtureDirectory, "entries-empty.html"),
  "utf8",
);

describe("parseIpingSearchHtml", () => {
  it("normalizes nationwide and district awards from the authenticated result table", () => {
    const records = parseIpingSearchHtml(
      awardsFixture,
      "홍라켓",
      "2026-08-12T00:00:00.000Z",
      "award",
    );
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      sourceCode: "iping",
      playerName: "홍라켓",
      clubText: "핑퐁클럽",
      tournamentDate: "2026-07-19",
      eventName: "오픈단체 [5~8/]부",
      eventType: "team",
      divisionSystem: "open",
      divisionValue: "6부",
      rankText: "3위",
    });
    expect(records[1]).toMatchObject({
      region: "경상북도 영주시",
      tournamentRegion: "경상북도 영주시",
      eventType: "singles",
      divisionSystem: "integrated",
      rankText: "준우승",
    });
  });

  it("keeps a club-only region out of tournament-region evidence", () => {
    const clubOnlyRegionFixture = awardsFixture.replace("핑퐁클럽", "용인클럽");
    const records = parseIpingSearchHtml(
      clubOnlyRegionFixture,
      "홍라켓",
      "2026-08-12T00:00:00.000Z",
      "award",
    );

    expect(records[0]?.region).toBeUndefined();
    expect(records[0]?.tournamentRegion).toBeUndefined();
  });

  it("normalizes participation rows without inventing a rank", () => {
    const records = parseIpingSearchHtml(
      entriesFixture,
      "홍라켓",
      "2026-08-12T00:00:00.000Z",
      "entry",
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tournamentDate: "2026-07-18",
      eventName: "오픈개인 [5~8/]부",
      eventType: "singles",
      divisionSystem: "open",
      divisionValue: "6부",
    });
    expect(records[0]?.rankText).toBeUndefined();
  });

  it("keeps parsing results when the table ends with a layout spacer row", () => {
    const records = parseIpingSearchHtml(
      entriesWithSpacerFixture,
      "홍라켓",
      "2026-08-12T00:00:00.000Z",
      "entry",
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ tournamentDate: "2026-07-18" });
  });

  it("reports an empty result table as no records instead of a schema change", () => {
    expect(
      parseIpingSearchHtml(
        emptyEntriesFixture,
        "홍라켓",
        "2026-08-12T00:00:00.000Z",
        "entry",
      ),
    ).toEqual([]);
  });

  it("still reports an unexpected result column count as a schema change", () => {
    const changedColumns = entriesWithSpacerFixture.replace(
      '<tr style="background: #ffffff">',
      '<tr style="background: #ffffff"><td align="center">1</td>',
    );

    expect(() =>
      parseIpingSearchHtml(
        changedColumns,
        "홍라켓",
        "2026-08-12T00:00:00.000Z",
        "entry",
      ),
    ).toThrow(SourceSchemaChangedError);
  });

  it("rejects a login page instead of treating it as an empty result", () => {
    expect(() =>
      parseIpingSearchHtml(
        '<form><input name="Mid"><input name="Pwd"></form>',
        "홍라켓",
        "2026-08-12T00:00:00.000Z",
        "award",
      ),
    ).toThrow(SourceSchemaChangedError);
  });
});
