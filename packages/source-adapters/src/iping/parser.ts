import {
  inferKoreanRegion,
  inferRecordDivisionSystem,
  normalizePlayerName,
  normalizeSearchText,
  stableHash,
  withRecordHashes,
  type NormalizedRecord,
} from "@busu/domain";
import { SourceSchemaChangedError } from "@busu/crawler-core";
import {
  decodeHtml,
  escapeRegExp,
  eventTypeFromText,
  extractTableCells,
  normalizeObservedDivision,
  stripHtml,
} from "../html";
import {
  ipingParsedRowSchema,
  type IpingParsedRow,
  type IpingResultKind,
} from "./schema";

export const IPING_BASE_URL = "https://www.iping.club/";
export const IPING_SEARCH_URL = `${IPING_BASE_URL}?pg=Search`;

function resultTable(html: string, resultKind: IpingResultKind): string {
  const expectedHeading = resultKind === "award" ? "입상이력" : "출전이력";
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu)].map(
    (match) => match[1] ?? "",
  );
  const table = tables.find((candidate) => {
    const text = stripHtml(candidate);
    return text.includes("선수명") && text.includes(expectedHeading);
  });
  if (!table)
    throw new SourceSchemaChangedError(
      `아이핑 ${expectedHeading} 결과 표 구조를 찾지 못했습니다.`,
    );
  return table;
}

function classContent(block: string, className: string): string {
  return (
    new RegExp(
      `<span\\b[^>]*class=(['"])[^'"]*\\b${className}\\b[^'"]*\\1[^>]*>([\\s\\S]*?)<\\/span>`,
      "iu",
    ).exec(block)?.[2] ?? ""
  );
}

function eventTypeFromIping(value: string): IpingParsedRow["eventType"] {
  const eventType = eventTypeFromText(value);
  if (eventType !== "unknown") return eventType;
  return /개인/u.test(value) ? "singles" : "unknown";
}

function firstIpingDate(value: string): string | undefined {
  const match = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/u.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseResultRow(
  rowHtml: string,
  resultKind: IpingResultKind,
): IpingParsedRow | undefined {
  const cells = extractTableCells(rowHtml);
  if (cells.length === 0) return undefined;
  const rowText = stripHtml(rowHtml);
  if (
    rowText.includes("입상이력이 없습니다") ||
    rowText.includes("출전이력이 없습니다")
  )
    return undefined;
  if (
    rowText.includes("선수명") &&
    rowText.includes(resultKind === "award" ? "입상이력" : "출전이력")
  )
    return undefined;
  if (cells.length !== 2)
    throw new SourceSchemaChangedError(
      "아이핑 선수 결과 열 개수가 변경되었습니다.",
    );

  const playerCell = cells[0] ?? "";
  const resultCell = cells[1] ?? "";
  const playerBoldValues = [
    ...playerCell.matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/giu),
  ].map((match) => stripHtml(match[1] ?? ""));
  const playerName = playerBoldValues[0] ?? "";
  const divisionValue = normalizeObservedDivision(
    playerBoldValues[1]?.replace(/[()]/gu, ""),
  );
  const clubText = stripHtml(classContent(playerCell, "text13g"));

  const detailAnchors = [
    ...resultCell.matchAll(
      /<a\b[^>]*href=(['"])([^'"]*pg=CVR[^'"]*)\1[^>]*>([\s\S]*?)<\/a\s*>/giu,
    ),
  ];
  const tournamentAnchor = detailAnchors[0];
  const eventAnchor = detailAnchors[1];
  if (!tournamentAnchor?.[2] || !eventAnchor?.[3])
    throw new SourceSchemaChangedError(
      "아이핑 대회 결과 링크 구조가 변경되었습니다.",
    );
  const tournamentName = stripHtml(tournamentAnchor[3] ?? "");
  const eventWithRank = stripHtml(eventAnchor[3]);
  const rankValues = [
    ...eventAnchor[3].matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/giu),
  ]
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);
  const rankText = resultKind === "award" ? rankValues.at(-1) : undefined;
  if (resultKind === "award" && !rankText)
    throw new SourceSchemaChangedError(
      "아이핑 입상 순위 구조가 변경되었습니다.",
    );
  const eventName = rankText
    ? eventWithRank
        .replace(new RegExp(`${escapeRegExp(rankText)}\\s*$`, "u"), "")
        .trim()
    : eventWithRank;
  const tournamentDate = firstIpingDate(rowText);
  if (!playerName || !tournamentName || !eventName || !tournamentDate)
    throw new SourceSchemaChangedError(
      "아이핑 선수 결과 필수 항목을 찾지 못했습니다.",
    );
  const tournamentScale = /시군구대회/u.test(rowText)
    ? "시군구대회"
    : /전국오픈/u.test(rowText)
      ? "전국오픈"
      : "대회 체계 확인 필요";
  const sourceUrl = new URL(
    decodeHtml(tournamentAnchor[2]),
    IPING_BASE_URL,
  ).toString();

  return ipingParsedRowSchema.parse({
    playerName,
    ...(clubText ? { clubText } : {}),
    tournamentName,
    tournamentDate,
    tournamentScale,
    eventName,
    eventType: eventTypeFromIping(eventName),
    ...(divisionValue ? { divisionValue } : {}),
    ...(rankText ? { rankText } : {}),
    sourceUrl,
  });
}

export function parseIpingSearchHtml(
  html: string,
  expectedName: string,
  observedAt: string,
  resultKind: IpingResultKind,
): NormalizedRecord[] {
  if (html.includes('name="Mid"') && html.includes('name="Pwd"')) {
    throw new SourceSchemaChangedError("아이핑 인증 세션이 만료되었습니다.");
  }
  if (
    !html.includes("아이핑검색") ||
    !html.includes(resultKind === "award" ? "입상이력" : "출전이력")
  ) {
    throw new SourceSchemaChangedError(
      "아이핑 검색 페이지 식별자를 찾지 못했습니다.",
    );
  }
  const table = resultTable(html, resultKind);
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  const parsedRows = rows.flatMap((row) => {
    const parsed = parseResultRow(row[1] ?? "", resultKind);
    return parsed ? [parsed] : [];
  });
  const normalizedExpectedName = normalizePlayerName(expectedName);

  return parsedRows.flatMap((row) => {
    if (normalizePlayerName(row.playerName) !== normalizedExpectedName)
      return [];
    const sourceIdentityKey = stableHash({
      sourceCode: "iping",
      normalizedName: normalizedExpectedName,
      ...(row.clubText
        ? { club: normalizeSearchText(row.clubText) }
        : { tournament: normalizeSearchText(row.tournamentName) }),
    });
    const tournamentRegion = inferKoreanRegion(
      row.tournamentName,
      row.eventName,
    );
    return [
      withRecordHashes({
        sourceCode: "iping",
        sourceIdentityKey,
        playerName: row.playerName,
        normalizedPlayerName: normalizedExpectedName,
        ...(row.clubText ? { clubText: row.clubText } : {}),
        ...(tournamentRegion ? { region: tournamentRegion } : {}),
        ...(tournamentRegion ? { tournamentRegion } : {}),
        tournamentName: row.tournamentName,
        tournamentDate: row.tournamentDate,
        eventName: row.eventName,
        eventType: row.eventType,
        divisionSystem: inferRecordDivisionSystem({
          eventName: row.eventName,
          tournamentName: row.tournamentName,
          tournamentDate: row.tournamentDate,
          tournamentRegion,
          additionalEvidence: [row.tournamentScale, row.divisionValue],
        }),
        ...(row.divisionValue ? { divisionValue: row.divisionValue } : {}),
        ...(row.rankText ? { rankText: row.rankText } : {}),
        sourceUrl: row.sourceUrl,
        observedAt,
      }),
    ];
  });
}
