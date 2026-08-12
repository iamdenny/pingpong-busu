import { inferDivisionSystem, inferKoreanRegion, normalizePlayerName, normalizeSearchText, stableHash, withRecordHashes, type NormalizedRecord } from '@busu/domain';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { eventTypeFromText, extractTableCells, firstIsoDate, normalizeObservedDivision, stripHtml } from '../html';
import { myttParsedRowSchema, myttSearchFormSchema, type MyttParsedRow } from './schema';

export const MYTT_SEARCH_URL = 'https://mytt.kr/main/player_list.xhtml';

export function parseMyttSearchForm(html: string): { viewState: string; submitButton: string } {
  if (!html.includes('mainForm:playerName') || !html.includes('javax.faces.ViewState')) {
    throw new SourceSchemaChangedError('마이티티 공개 검색 form 식별자를 찾지 못했습니다.');
  }
  const viewStateMatches = [...html.matchAll(/name=["']javax\.faces\.ViewState["'][^>]*value=["']([^"']+)["']/giu)];
  const viewState = viewStateMatches.at(-1)?.[1];
  const submitButton = /<button\b[^>]*id=["'](mainForm:[^"']+)["'][^>]*>[\s\S]*?<span\b[^>]*>\s*검색\s*<\/span>/iu.exec(html)?.[1];
  return myttSearchFormSchema.parse({ viewState, submitButton });
}

function playerFromCell(playersText: string, expectedName: string): Pick<MyttParsedRow, 'playerName' | 'divisionValue'> | undefined {
  const normalizedExpectedName = normalizePlayerName(expectedName);
  for (const token of playersText.split(',')) {
    const value = token.normalize('NFKC').trim();
    const match = /^(.*?)\s*\(([^()]*)\)\s*$/u.exec(value);
    const playerName = (match?.[1] ?? value).trim();
    if (normalizePlayerName(playerName) !== normalizedExpectedName) continue;
    const divisionValue = normalizeObservedDivision(match?.[2]);
    return { playerName, ...(divisionValue ? { divisionValue } : {}) };
  }
  return undefined;
}

export function parseMyttSearchHtml(html: string, expectedName: string, observedAt: string): NormalizedRecord[] {
  if (!html.includes('mainForm:playerTable') || !html.includes('mainForm:playerTable_data')) {
    throw new SourceSchemaChangedError('마이티티 결과 표 식별자를 찾지 못했습니다.');
  }
  const tbody = /<tbody\b[^>]*id=["']mainForm:playerTable_data["'][^>]*>([\s\S]*?)<\/tbody>/iu.exec(html)?.[1];
  if (tbody === undefined) throw new SourceSchemaChangedError('마이티티 결과 표 구조를 찾지 못했습니다.');
  if (tbody.includes('ui-datatable-empty-message') && tbody.includes('No records found')) return [];
  const rows = [...tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  const parsedRows: MyttParsedRow[] = rows.flatMap((row) => {
    const cells = extractTableCells(row[1] ?? '');
    if (cells.length !== 8) throw new SourceSchemaChangedError('마이티티 결과 열 개수가 변경되었습니다.');
    const playersText = stripHtml(cells[7] ?? '');
    const player = playerFromCell(playersText, expectedName);
    if (!player) return [];
    const tournamentDate = firstIsoDate(stripHtml(cells[2] ?? ''));
    const rank = stripHtml(cells[5] ?? '');
    const eventName = stripHtml(cells[4] ?? '');
    const eventType = eventTypeFromText(eventName);
    const clubText = stripHtml(cells[6] ?? '');
    return [myttParsedRowSchema.parse({
      tournamentName: stripHtml(cells[1] ?? ''),
      ...(tournamentDate ? { tournamentDate } : {}),
      scale: stripHtml(cells[3] ?? ''),
      eventName,
      eventType,
      ...(rank && rank !== '-' ? { rankText: rank } : {}),
      ...(clubText ? { clubText } : {}),
      ...player,
      ...(eventType === 'team' || eventType === 'doubles' ? { partnerText: playersText } : {}),
    })];
  });

  const normalizedExpectedName = normalizePlayerName(expectedName);
  return parsedRows.map((row) => {
    const sourceIdentityKey = stableHash({ sourceCode: 'mytt', normalizedName: normalizedExpectedName, ...(row.clubText ? { club: normalizeSearchText(row.clubText) } : { tournament: row.tournamentName }) });
    const region = inferKoreanRegion(row.tournamentName, row.eventName);
    return withRecordHashes({
      sourceCode: 'mytt', sourceIdentityKey, playerName: row.playerName, normalizedPlayerName: normalizedExpectedName,
      ...(row.clubText ? { clubText: row.clubText } : {}), ...(region ? { region } : {}), tournamentName: row.tournamentName,
      ...(row.tournamentDate ? { tournamentDate: row.tournamentDate } : {}), eventName: row.eventName, eventType: row.eventType,
      divisionSystem: inferDivisionSystem(row.scale, row.tournamentName, row.eventName, row.divisionValue),
      ...(row.divisionValue ? { divisionValue: row.divisionValue } : {}), ...(row.rankText ? { rankText: row.rankText } : {}),
      ...(row.partnerText ? { partnerText: row.partnerText } : {}), sourceUrl: MYTT_SEARCH_URL, observedAt,
    });
  });
}
