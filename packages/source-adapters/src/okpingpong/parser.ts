import { inferEventDivisionSystem, inferKoreanRegion, normalizePlayerName, normalizeSearchText, stableHash, withRecordHashes, type NormalizedRecord } from '@busu/domain';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { eventTypeFromText, extractTableCells, firstIsoDate, normalizeObservedDivision, stripHtml } from '../html';
import { okPingpongParsedRowSchema, type OkPingpongParsedRow } from './schema';

export const OKPINGPONG_SEARCH_URL = 'http://okpingpong.co.kr/04match/08.php';

interface GroupContext {
  playerName: string;
  clubText?: string;
  category: string;
  tournamentName: string;
  tournamentDate?: string;
}

export function parseOkPingpongSearchHtml(html: string, expectedName: string, observedAt: string): NormalizedRecord[] {
  if (!html.includes('playerSearchForm') || !html.includes('result_tbl_total')) {
    throw new SourceSchemaChangedError('오케이핑퐁 검색 페이지 식별자를 찾지 못했습니다.');
  }
  const table = /<table\b[^>]*class=(['"])[^'"]*\bresult_tbl_total\b[^'"]*\1[^>]*>([\s\S]*?)<\/table>/iu.exec(html)?.[2];
  const tbody = table ? /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu.exec(table)?.[1] : undefined;
  if (tbody === undefined) throw new SourceSchemaChangedError('오케이핑퐁 결과 표 구조를 찾지 못했습니다.');
  const rows = [...tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  if (rows.length === 0) return [];

  let group: GroupContext | undefined;
  const parsedRows: OkPingpongParsedRow[] = [];
  for (const row of rows) {
    const cells = extractTableCells(row[1] ?? '');
    let detailCells: string[];
    if (cells.length >= 8) {
      const tournamentDate = firstIsoDate(stripHtml(cells[4] ?? ''));
      const clubText = stripHtml(cells[1] ?? '');
      group = {
        playerName: stripHtml(cells[0] ?? ''),
        ...(clubText ? { clubText } : {}),
        category: stripHtml(cells[2] ?? ''),
        tournamentName: stripHtml(cells[3] ?? ''),
        ...(tournamentDate ? { tournamentDate } : {}),
      };
      detailCells = cells.slice(5, 8);
    } else if (cells.length === 3 && group) {
      detailCells = cells;
    } else {
      throw new SourceSchemaChangedError('오케이핑퐁 결과 열 개수가 변경되었습니다.');
    }
    const eventName = stripHtml(detailCells[1] ?? '').replace(/^\[(?:단식|복식|단체전?)\]\s*/u, '').trim();
    const rankText = stripHtml(/<span\b[^>]*class=(['"])[^'"]*\bgame_result\b[^'"]*\1[^>]*>([\s\S]*?)<\/span>/iu.exec(detailCells[2] ?? '')?.[2] ?? '');
    const fullResult = stripHtml(detailCells[2] ?? '');
    const partnerText = fullResult.replace(rankText, '').replace(/:\s*$/u, '').trim();
    parsedRows.push(okPingpongParsedRowSchema.parse({
      ...group,
      eventName,
      eventType: eventTypeFromText(stripHtml(detailCells[1] ?? '')),
      ...(normalizeObservedDivision(stripHtml(detailCells[0] ?? '')) ? { divisionValue: normalizeObservedDivision(stripHtml(detailCells[0] ?? '')) } : {}),
      ...(rankText ? { rankText } : {}),
      ...(partnerText ? { partnerText } : {}),
    }));
  }

  const normalizedExpectedName = normalizePlayerName(expectedName);
  const stableSourceUrl = new URL(OKPINGPONG_SEARCH_URL);
  stableSourceUrl.searchParams.set('key', 'name');
  stableSourceUrl.searchParams.set('keyword', expectedName.trim());
  return parsedRows.flatMap((row) => {
    if (normalizePlayerName(row.playerName) !== normalizedExpectedName) return [];
    const sourceIdentityKey = stableHash({ sourceCode: 'okpingpong', normalizedName: normalizedExpectedName, ...(row.clubText ? { club: normalizeSearchText(row.clubText) } : { tournament: row.tournamentName }) });
    const region = inferKoreanRegion(row.tournamentName, row.eventName);
    return [withRecordHashes({
      sourceCode: 'okpingpong', sourceIdentityKey, playerName: row.playerName, normalizedPlayerName: normalizedExpectedName,
      ...(row.clubText ? { clubText: row.clubText } : {}), ...(region ? { region } : {}), tournamentName: row.tournamentName,
      ...(row.tournamentDate ? { tournamentDate: row.tournamentDate } : {}), eventName: row.eventName, eventType: row.eventType,
      divisionSystem: inferEventDivisionSystem(row.eventName, row.category, row.tournamentName, row.divisionValue),
      ...(row.divisionValue ? { divisionValue: row.divisionValue } : {}), ...(row.rankText ? { rankText: row.rankText } : {}),
      ...(row.partnerText ? { partnerText: row.partnerText } : {}), sourceUrl: stableSourceUrl.toString(), observedAt,
    })];
  });
}
