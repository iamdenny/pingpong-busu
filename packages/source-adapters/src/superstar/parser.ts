import { inferEventDivisionSystem, inferKoreanRegion, normalizePlayerName, stableHash, withRecordHashes, type NormalizedRecord } from '@busu/domain';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { decodeHtml, eventTypeFromText, extractTableCells, firstIsoDate, normalizeObservedDivision, stripHtml } from '../html';
import { superstarParsedRowSchema, type SuperstarParsedRow } from './schema';

export const SUPERSTAR_SEARCH_URL = 'https://www.superstar.kr/open/Do.jsp?urlSeq=302';

function splitTournamentAndEvent(value: string): { tournamentName: string; eventName: string } {
  const marker = /\s(?=(?:개인|남자|여자|혼성)?(?:단식|복식|단체전))/u.exec(value);
  if (!marker || marker.index < 4) return { tournamentName: value, eventName: value };
  return {
    tournamentName: value.slice(0, marker.index).trim(),
    eventName: value.slice(marker.index).trim(),
  };
}

function resultTable(html: string): string {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu)].map((match) => match[1] ?? '');
  const table = tables.find((candidate) => {
    const text = stripHtml(candidate);
    return text.includes('고유번호') && text.includes('대회일자') && text.includes('대회명') && text.includes('부수') && text.includes('결과');
  });
  if (!table) throw new SourceSchemaChangedError('슈퍼스타 개인별 결과 표 구조를 찾지 못했습니다.');
  return table;
}

export function parseSuperstarSearchHtml(html: string, expectedName: string, observedAt: string): NormalizedRecord[] {
  if (!html.includes('개인별 결과') || !html.includes('탁구대회 성적')) {
    throw new SourceSchemaChangedError('슈퍼스타 개인별 결과 페이지 식별자를 찾지 못했습니다.');
  }
  const echoedName = /<input\b[^>]*name=["']userNm["'][^>]*value=["']([^"']*)["']/iu.exec(html)?.[1];
  if (echoedName === undefined || normalizePlayerName(decodeHtml(echoedName)) !== normalizePlayerName(expectedName)) {
    throw new SourceSchemaChangedError('슈퍼스타 검색 응답의 선수 이름을 확인하지 못했습니다.');
  }
  const rows = [...resultTable(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  const normalizedName = normalizePlayerName(expectedName);
  const parsedRows: SuperstarParsedRow[] = rows.flatMap((row) => {
    const cells = extractTableCells(row[1] ?? '');
    if (cells.length === 0) return [];
    if (cells.length !== 5) throw new SourceSchemaChangedError('슈퍼스타 개인별 결과 열 개수가 변경되었습니다.');
    if (stripHtml(cells[0] ?? '') === '고유번호') return [];
    const tournamentDate = firstIsoDate(stripHtml(cells[1] ?? ''));
    if (!tournamentDate) throw new SourceSchemaChangedError('슈퍼스타 대회일자 구조가 변경되었습니다.');
    const rawTournament = stripHtml(cells[2] ?? '');
    const { tournamentName, eventName } = splitTournamentAndEvent(rawTournament);
    const divisionValue = normalizeObservedDivision(stripHtml(cells[3] ?? ''));
    const rankText = stripHtml(cells[4] ?? '');
    return [superstarParsedRowSchema.parse({
      externalPlayerId: stripHtml(cells[0] ?? ''),
      playerName: expectedName.trim(),
      tournamentDate,
      tournamentName,
      eventName,
      eventType: eventTypeFromText(eventName),
      ...(divisionValue ? { divisionValue } : {}),
      ...(rankText ? { rankText } : {}),
    })];
  });

  const stableSourceUrl = new URL(SUPERSTAR_SEARCH_URL);
  stableSourceUrl.searchParams.set('userNm', expectedName.trim());
  return parsedRows.map((row) => {
    const region = inferKoreanRegion(row.tournamentName, row.eventName);
    return withRecordHashes({
      sourceCode: 'superstar',
      externalPlayerId: row.externalPlayerId,
      sourceIdentityKey: stableHash({ sourceCode: 'superstar', externalPlayerId: row.externalPlayerId, normalizedName }),
      playerName: row.playerName,
      normalizedPlayerName: normalizedName,
      ...(region ? { region } : {}),
      tournamentName: row.tournamentName,
      tournamentDate: row.tournamentDate,
      eventName: row.eventName,
      eventType: row.eventType,
      divisionSystem: inferEventDivisionSystem(row.eventName, row.tournamentName, row.divisionValue),
      ...(row.divisionValue ? { divisionValue: row.divisionValue } : {}),
      ...(row.rankText ? { rankText: row.rankText } : {}),
      sourceUrl: stableSourceUrl.toString(),
      observedAt,
    });
  });
}
