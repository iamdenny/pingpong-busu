import { inferEventDivisionSystem, inferKoreanRegion, normalizePlayerName, normalizeSearchText, stableHash, withRecordHashes, type NormalizedRecord } from '@busu/domain';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { airpingParsedRowSchema, type AirpingParsedRow } from './schema';
import { decodeHtml, escapeRegExp, eventTypeFromText, firstIsoDate, normalizeObservedDivision, stripHtml } from '../html';

export const AIRPING_SEARCH_URL = 'https://airping.co.kr/11player/01.php';

function classContent(block: string, className: string): string {
  return new RegExp(`<div\\b[^>]*class=(['"])[^'"]*\\b${className}\\b[^'"]*\\1[^>]*>([\\s\\S]*?)<\\/div>`, 'iu').exec(block)?.[2] ?? '';
}

function tournamentNameFromAnchor(anchorHtml: string): string {
  const afterMetadata = /<\/div>\s*([^<>]+?)\s*<\/div>\s*$/iu.exec(anchorHtml)?.[1];
  return stripHtml(afterMetadata ?? anchorHtml);
}

function parseEvents(block: string, playerName: string): AirpingParsedRow['events'] {
  const eventBlocks = block.split(/(?=<li\b[^>]*class=(['"])[^'"]*\bplayer_join_li\b)/giu).filter((part) => /\bplayer_join_li\b/iu.test(part));
  const escapedName = escapeRegExp(playerName);
  return eventBlocks.flatMap((eventBlock) => {
    const eventHeading = classContent(eventBlock, 'f_bold');
    const eventName = stripHtml(eventHeading).replace(/^\[(?:단식|복식|단체전?)\]\s*/u, '').trim();
    if (!eventName) return [];
    const rankText = stripHtml(/<span\b[^>]*class=(['"])[^'"]*\bgame_result\b[^'"]*\1[^>]*>([\s\S]*?)<\/span>/iu.exec(eventBlock)?.[2] ?? '');
    const fullText = stripHtml(eventBlock);
    const divisionRaw = new RegExp(`${escapedName}\\s*[/／]\\s*([A-Za-z가-힣0-9]+)`, 'iu').exec(fullText)?.[1];
    const divisionValue = normalizeObservedDivision(divisionRaw);
    const resultText = fullText.split(' - ').slice(1).join(' - ').replace(/prized:\s*[01]/giu, '').trim();
    return [{
      eventName,
      eventType: eventTypeFromText(stripHtml(eventHeading)),
      ...(divisionValue ? { divisionValue } : {}),
      ...(rankText ? { rankText } : {}),
      ...(resultText ? { partnerText: resultText } : {}),
    }];
  });
}

export function parseAirpingSearchHtml(html: string, expectedName: string, observedAt: string): NormalizedRecord[] {
  if (!html.includes('playerSearchForm') || !html.includes('_mc_content_list')) {
    throw new SourceSchemaChangedError('에어핑퐁 검색 페이지 식별자를 찾지 못했습니다.');
  }
  if (html.includes('검색결과가 없습니다.') && !html.includes('player_join_li')) return [];

  const blocks = html.split(/(?=<li\b[^>]*class=(['"])[^'"]*\bplayer_cont_li\b[^'"]*\b_mc_div\b)/giu)
    .filter((block) => /\bplayer_cont_li\b/iu.test(block) && !/\b_vc_fixed\b/iu.test(block));
  const parsedRows: AirpingParsedRow[] = blocks.flatMap((block) => {
    const playerName = stripHtml(classContent(block, 'player_name'));
    const clubText = stripHtml(classContent(block, 'player_club'));
    const tournamentAnchor = /<div\b[^>]*class=(['"])[^'"]*\bplayer_inner4\b[^'"]*\1[^>]*>[\s\S]*?<a\b[^>]*href=(['"])(.*?)\2[^>]*>([\s\S]*?)<\/a>/iu.exec(block);
    const tournamentName = tournamentNameFromAnchor(tournamentAnchor?.[4] ?? '');
    const tournamentDate = firstIsoDate(stripHtml(classContent(block, 'player_inner5')));
    const sourceUrl = tournamentAnchor?.[3] ? new URL(decodeHtml(tournamentAnchor[3]), AIRPING_SEARCH_URL).toString() : AIRPING_SEARCH_URL;
    const regionEvidence = stripHtml(tournamentAnchor?.[4] ?? '');
    const events = parseEvents(block, playerName);
    if (!playerName || !tournamentName || events.length === 0) return [];
    return [airpingParsedRowSchema.parse({ playerName, ...(clubText ? { clubText } : {}), tournamentName, ...(tournamentDate ? { tournamentDate } : {}), regionEvidence, sourceUrl, events })];
  });

  const normalizedExpectedName = normalizePlayerName(expectedName);
  return parsedRows.flatMap((row) => {
    if (normalizePlayerName(row.playerName) !== normalizedExpectedName) return [];
    const sourceIdentityKey = stableHash({ sourceCode: 'airping', normalizedName: normalizedExpectedName, ...(row.clubText ? { club: normalizeSearchText(row.clubText) } : { tournament: row.tournamentName }) });
    return row.events.map((event) => {
      const region = inferKoreanRegion(row.regionEvidence, row.tournamentName, event.eventName);
      return withRecordHashes({
        sourceCode: 'airping', sourceIdentityKey, playerName: row.playerName, normalizedPlayerName: normalizedExpectedName,
        ...(row.clubText ? { clubText: row.clubText } : {}), ...(region ? { region } : {}), tournamentName: row.tournamentName,
        ...(row.tournamentDate ? { tournamentDate: row.tournamentDate } : {}), eventName: event.eventName,
        eventType: event.eventType, divisionSystem: inferEventDivisionSystem(event.eventName, row.regionEvidence, row.tournamentName, event.divisionValue),
        ...(event.divisionValue ? { divisionValue: event.divisionValue } : {}), ...(event.rankText ? { rankText: event.rankText } : {}),
        ...(event.partnerText ? { partnerText: event.partnerText } : {}), sourceUrl: row.sourceUrl, observedAt,
      });
    });
  });
}
