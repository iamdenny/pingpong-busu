import {
  inferEventDivisionSystem,
  inferKoreanRegion,
  normalizePlayerName,
  normalizeSearchText,
  stableHash,
  withRecordHashes,
  type EventType,
  type NormalizedRecord,
  type SourceCode,
} from "@busu/domain";
import { SourceSchemaChangedError } from "@busu/crawler-core";
import {
  decodeHtml,
  escapeRegExp,
  extractTableCells,
  normalizeObservedDivision,
  stripHtml,
} from "../html";
import {
  memberSearchParsedRowSchema,
  type MemberSearchParsedRow,
} from "./schema";

export interface MemberSearchParserOptions {
  sourceCode: SourceCode;
  sourceName: string;
  baseUrl: string;
}

function resultTableFrom(html: string, sourceName: string): string {
  if (!html.includes("member_search") || !html.includes("탁구인검색")) {
    throw new SourceSchemaChangedError(
      `${sourceName} 검색 페이지 식별자를 찾지 못했습니다.`,
    );
  }
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/giu)].map(
    (match) => match[0],
  );
  const table = tables.find(
    (candidate) =>
      /<caption\b[^>]*>[\s\S]*?탁구인검색[\s\S]*?<\/caption>/iu.test(
        candidate,
      ) &&
      /<th\b[^>]*>[\s\S]*?이름[\s\S]*?<\/th>/iu.test(candidate) &&
      /<th\b[^>]*>[\s\S]*?대회명[\s\S]*?<\/th>/iu.test(candidate),
  );
  if (!table) {
    throw new SourceSchemaChangedError(
      `${sourceName} 결과 표 구조를 찾지 못했습니다.`,
    );
  }
  return table;
}

function eventTypeFrom(
  href: string,
  label: string,
  baseUrl: string,
): EventType {
  const matchMethod = new URL(href, baseUrl).searchParams.get("matchmethod");
  if (matchMethod === "3" || label.includes("단식")) return "singles";
  if (matchMethod === "4" || label.includes("복식")) return "doubles";
  if (matchMethod === "5" || label.includes("단체")) return "team";
  return "unknown";
}

function parseEvents(
  cellHtml: string,
  playerName: string,
  options: MemberSearchParserOptions,
): MemberSearchParsedRow["events"] {
  const expectedOrigin = new URL(options.baseUrl).origin;
  const anchors = [
    ...cellHtml.matchAll(
      /<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/giu,
    ),
  ];
  return anchors.map((match) => {
    const href = decodeHtml(match[2] ?? "");
    const sourceUrl = new URL(href, options.baseUrl);
    if (sourceUrl.origin !== expectedOrigin) {
      throw new SourceSchemaChangedError(
        `${options.sourceName} 결과에 허용되지 않은 외부 링크가 있습니다.`,
      );
    }
    const content = match[3] ?? "";
    const firstLine = content.split(/<br\s*\/?\s*>/iu)[0] ?? "";
    const eventName = stripHtml(firstLine);
    const rankMatch =
      /<font\b[^>]*color=(['"]?)red\1[^>]*>([\s\S]*?)<\/font\s*>/iu.exec(
        content,
      );
    const rankText = stripHtml(rankMatch?.[2] ?? "");
    const fullText = stripHtml(content);
    const divisionMatch = new RegExp(
      `${escapeRegExp(playerName)}\\s*\\(([^)]+)\\)`,
      "u",
    ).exec(fullText);
    const divisionValue = normalizeObservedDivision(divisionMatch?.[1]);
    const eventType = eventTypeFrom(href, eventName, options.baseUrl);
    const partnerText =
      eventType === "singles"
        ? undefined
        : fullText.replace(eventName, "").replace(rankText, "").trim();
    return {
      eventName,
      eventType,
      ...(divisionValue ? { divisionValue } : {}),
      ...(rankText ? { rankText } : {}),
      ...(partnerText ? { partnerText } : {}),
      sourceUrl: sourceUrl.toString(),
    };
  });
}

export function parseMemberSearchHtml(
  html: string,
  expectedName: string,
  observedAt: string,
  options: MemberSearchParserOptions,
): NormalizedRecord[] {
  const table = resultTableFrom(html, options.sourceName);
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu.exec(table)?.[1];
  if (tbody === undefined) {
    throw new SourceSchemaChangedError(
      `${options.sourceName} 결과 표 본문을 찾지 못했습니다.`,
    );
  }
  if (
    /class=(['"])[^'"]*\bempty_table\b[^'"]*\1/iu.test(tbody) &&
    tbody.includes("게시물이 없습니다")
  )
    return [];
  const rows = [...tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  if (rows.length === 0) return [];

  const normalizedExpectedName = normalizePlayerName(expectedName);
  const parsedRows: MemberSearchParsedRow[] = rows.flatMap((row) => {
    const cells = extractTableCells(row[1] ?? "");
    if (cells.length < 2) {
      throw new SourceSchemaChangedError(
        `${options.sourceName} 결과 열 개수가 변경되었습니다.`,
      );
    }
    const playerName = stripHtml(cells[1] ?? "");
    if (normalizePlayerName(playerName) !== normalizedExpectedName) return [];
    if (cells.length < 6) {
      throw new SourceSchemaChangedError(
        `${options.sourceName} 결과 열 개수가 변경되었습니다.`,
      );
    }
    const clubText = stripHtml(cells[2] ?? "");
    const tournamentName = stripHtml(cells[3] ?? "").replace(
      /\s*\(완\)\s*$/u,
      "",
    );
    const rawDate = stripHtml(cells[4] ?? "");
    const tournamentDate = /\d{4}-\d{2}-\d{2}/u.exec(rawDate)?.[0];
    const events = parseEvents(cells[5] ?? "", playerName, options);
    return [
      memberSearchParsedRowSchema.parse({
        playerName,
        clubText,
        tournamentName,
        ...(tournamentDate ? { tournamentDate } : {}),
        events,
      }),
    ];
  });

  return parsedRows.flatMap((row) => {
    const sourceIdentityKey = stableHash({
      sourceCode: options.sourceCode,
      normalizedName: normalizedExpectedName,
      club: normalizeSearchText(row.clubText),
    });
    return row.events.map((event) => {
      const region = inferKoreanRegion(row.tournamentName, event.eventName);
      const divisionSystem = inferEventDivisionSystem(
        event.eventName,
        row.tournamentName,
        event.divisionValue,
      );
      return withRecordHashes({
        sourceCode: options.sourceCode,
        sourceIdentityKey,
        playerName: row.playerName,
        normalizedPlayerName: normalizedExpectedName,
        clubText: row.clubText,
        tournamentName: row.tournamentName,
        ...(row.tournamentDate ? { tournamentDate: row.tournamentDate } : {}),
        ...(region ? { region } : {}),
        eventName: event.eventName,
        eventType: event.eventType,
        divisionSystem,
        ...(event.divisionValue ? { divisionValue: event.divisionValue } : {}),
        ...(event.rankText ? { rankText: event.rankText } : {}),
        ...(event.partnerText ? { partnerText: event.partnerText } : {}),
        sourceUrl: event.sourceUrl,
        observedAt,
      });
    });
  });
}
