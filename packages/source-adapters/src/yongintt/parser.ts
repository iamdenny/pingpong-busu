import { inferDivisionSystem, normalizePlayerName, stableHash, withRecordHashes, type NormalizedRecord } from '@busu/domain';
import { escapeRegExp, firstIsoDate, normalizeObservedDivision, stripHtml } from '../html';
import { kakaoCafeSearchResponseSchema, type KakaoCafeDocument } from './schema';

export const KAKAO_CAFE_SEARCH_URL = 'https://dapi.kakao.com/v2/search/cafe';
export const YONGIN_TT_CAFE_URL = 'https://cafe.daum.net/yongintt';

export interface YonginCafeSearchPage {
  records: NormalizedRecord[];
  isEnd: boolean;
}

function isYonginCafePost(value: string): boolean {
  const url = new URL(value);
  return (url.hostname === 'cafe.daum.net' || url.hostname === 'm.cafe.daum.net')
    && (url.pathname === '/yongintt' || url.pathname.startsWith('/yongintt/'));
}

function evidenceAroundName(title: string, contents: string, expectedName: string): string | undefined {
  const normalizedName = normalizePlayerName(expectedName);
  if (!normalizedName) return undefined;
  const namePattern = new RegExp([...normalizedName].map(escapeRegExp).join('\\s*'), 'iu');
  const evidence = `${title} ${contents}`;
  const match = namePattern.exec(evidence);
  if (!match) return undefined;
  return evidence.slice(Math.max(0, match.index - 60), Math.min(evidence.length, match.index + match[0].length + 80));
}

function rankFromEvidence(value: string): string | undefined {
  return /준우승|우승|(?:^|[^0-9])([123]위|4강)(?:$|[^0-9])/u.exec(value)?.[1]
    ?? /준우승|우승/u.exec(value)?.[0];
}

function divisionFromEvidence(value: string): string | undefined {
  return normalizeObservedDivision(/(?:여자|여성)?\s*((?:\d{1,2}|ACE|[ABC]|희망|초심)\s*부)/iu.exec(value)?.[1]);
}

function eventNameFromText(value: string): string {
  if (/입상/u.test(value) && /승급/u.test(value)) return '입상·승급 공지';
  if (/승급/u.test(value)) return '승급 공지';
  if (/입상|준우승|우승|[123]위|4강/u.test(value)) return '입상 공지';
  return '대회 관련 게시글';
}

function toRecord(document: KakaoCafeDocument, expectedName: string, observedAt: string): NormalizedRecord | undefined {
  if (!isYonginCafePost(document.url)) return undefined;
  const title = stripHtml(document.title);
  const contents = stripHtml(document.contents);
  const nearbyEvidence = evidenceAroundName(title, contents, expectedName);
  if (!nearbyEvidence) return undefined;
  const normalizedName = normalizePlayerName(expectedName);
  const divisionValue = divisionFromEvidence(nearbyEvidence);
  const rankText = rankFromEvidence(nearbyEvidence);
  const tournamentDate = firstIsoDate(title);
  const sourcePublishedDate = document.datetime.slice(0, 10);
  const eventName = eventNameFromText(`${title} ${nearbyEvidence}`);
  return withRecordHashes({
    sourceCode: 'yongintt',
    sourceIdentityKey: stableHash({ sourceCode: 'yongintt', normalizedName, postUrl: document.url }),
    playerName: expectedName.trim(),
    normalizedPlayerName: normalizedName,
    region: '경기도 용인시',
    tournamentName: title,
    ...(tournamentDate ? { tournamentDate } : {}),
    sourcePublishedDate,
    eventName,
    eventType: 'unknown',
    ...(divisionValue ? { divisionSystem: inferDivisionSystem(nearbyEvidence, divisionValue), divisionValue } : {}),
    ...(rankText ? { rankText } : {}),
    sourceUrl: document.url,
    observedAt,
  });
}

export function parseYonginCafeSearchResponse(value: unknown, expectedName: string, observedAt: string): YonginCafeSearchPage {
  const response = kakaoCafeSearchResponseSchema.parse(value);
  const records = response.documents.flatMap((document) => {
    const record = toRecord(document, expectedName, observedAt);
    return record ? [record] : [];
  });
  return {
    records: [...new Map(records.map((record) => [record.naturalKeyHash, record])).values()],
    isEnd: response.meta.is_end,
  };
}
