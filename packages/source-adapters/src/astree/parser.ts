import { inferDivisionSystem, inferKoreanRegion, normalizePlayerName, normalizeSearchText, stableHash, withRecordHashes, type EventType, type NormalizedRecord } from '@busu/domain';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { normalizeObservedDivision } from '../html';
import { astreeParsedRowSchema, type AstreeParsedRow } from './schema';

const BASE_URL = 'https://astree.co.kr/bbs/board.php';

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/giu, ' ').replace(/<[^>]+>/gu, ' '))
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function extractCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map((match) => match[1] ?? '');
}

function eventTypeFrom(href: string, label: string): EventType {
  const matchMethod = new URL(href, BASE_URL).searchParams.get('matchmethod');
  if (matchMethod === '3' || label.includes('단식')) return 'singles';
  if (matchMethod === '4' || label.includes('복식')) return 'doubles';
  if (matchMethod === '5' || label.includes('단체')) return 'team';
  return 'unknown';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseEvents(cellHtml: string, playerName: string): AstreeParsedRow['events'] {
  const anchors = [...cellHtml.matchAll(/<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/giu)];
  return anchors.map((match) => {
    const href = decodeHtml(match[2] ?? '');
    const content = match[3] ?? '';
    const firstLine = content.split(/<br\s*\/?\s*>/iu)[0] ?? '';
    const eventName = stripHtml(firstLine);
    const rankMatch = /<font\b[^>]*color=(['"]?)red\1[^>]*>([\s\S]*?)<\/font>/iu.exec(content);
    const rankText = stripHtml(rankMatch?.[2] ?? '');
    const fullText = stripHtml(content);
    const divisionMatch = new RegExp(`${escapeRegExp(playerName)}\\s*\\(([^)]+)\\)`, 'u').exec(fullText);
    const divisionValue = normalizeObservedDivision(divisionMatch?.[1]);
    const eventType = eventTypeFrom(href, eventName);
    const partnerText = eventType === 'singles' ? undefined : fullText.replace(eventName, '').replace(rankText, '').trim();
    return {
      eventName,
      eventType,
      ...(divisionValue ? { divisionValue } : {}),
      ...(rankText ? { rankText } : {}),
      ...(partnerText ? { partnerText } : {}),
      sourceUrl: new URL(href, BASE_URL).toString(),
    };
  });
}

export function parseAstreeSearchHtml(html: string, expectedName: string, observedAt: string): NormalizedRecord[] {
  if (!html.includes('member_search') || !html.includes('탁구인검색')) {
    throw new SourceSchemaChangedError('애즈트리 검색 페이지 식별자를 찾지 못했습니다.');
  }
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu.exec(html)?.[1];
  if (tbody === undefined) throw new SourceSchemaChangedError('애즈트리 결과 표 구조를 찾지 못했습니다.');
  if (/class=(['"])[^'"]*\bempty_table\b[^'"]*\1/iu.test(tbody) && tbody.includes('게시물이 없습니다')) return [];
  const rows = [...tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  if (rows.length === 0) return [];

  const parsedRows: AstreeParsedRow[] = rows.map((row) => {
    const cells = extractCells(row[1] ?? '');
    if (cells.length < 6) throw new SourceSchemaChangedError('애즈트리 결과 열 개수가 변경되었습니다.');
    const playerName = stripHtml(cells[1] ?? '');
    const clubText = stripHtml(cells[2] ?? '');
    const tournamentName = stripHtml(cells[3] ?? '').replace(/\s*\(완\)\s*$/u, '');
    const rawDate = stripHtml(cells[4] ?? '');
    const tournamentDate = /\d{4}-\d{2}-\d{2}/u.exec(rawDate)?.[0];
    const events = parseEvents(cells[5] ?? '', playerName);
    return astreeParsedRowSchema.parse({ playerName, clubText, tournamentName, ...(tournamentDate ? { tournamentDate } : {}), events });
  });

  const normalizedExpectedName = normalizePlayerName(expectedName);
  return parsedRows.flatMap((row) => {
    if (normalizePlayerName(row.playerName) !== normalizedExpectedName) return [];
    const sourceIdentityKey = stableHash({ sourceCode: 'astree', normalizedName: normalizedExpectedName, club: normalizeSearchText(row.clubText) });
    return row.events.map((event) => {
      const region = inferKoreanRegion(row.tournamentName, event.eventName);
      const divisionSystem = inferDivisionSystem(row.tournamentName, event.eventName, event.divisionValue);
      return withRecordHashes({
      sourceCode: 'astree', sourceIdentityKey, playerName: row.playerName, normalizedPlayerName: normalizedExpectedName,
      clubText: row.clubText, tournamentName: row.tournamentName, ...(row.tournamentDate ? { tournamentDate: row.tournamentDate } : {}),
      ...(region ? { region } : {}),
      eventName: event.eventName, eventType: event.eventType, divisionSystem, ...(event.divisionValue ? { divisionValue: event.divisionValue } : {}),
      ...(event.rankText ? { rankText: event.rankText } : {}), ...(event.partnerText ? { partnerText: event.partnerText } : {}),
      sourceUrl: event.sourceUrl, observedAt,
      });
    });
  });
}
