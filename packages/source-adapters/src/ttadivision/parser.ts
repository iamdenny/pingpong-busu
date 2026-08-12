import { inferKoreanRegion, normalizePlayerName, stableHash, withRecordHashes, type NormalizedRecord } from '@busu/domain';
import { ttaDivisionSearchResponseSchema } from './schema';

export const TTA_DIVISION_SEARCH_URL = 'https://ttadivision.sports.or.kr/statistic/moveSearchOteamPlayer.do';

const provinceNames: Readonly<Record<string, string>> = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 광주: '광주광역시',
  대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도',
  충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도',
  경남: '경상남도', 제주: '제주특별자치도',
};

function normalizeOfficialRegion(value?: string | null): string | undefined {
  const parts = value?.normalize('NFKC').trim().split(/\s+/u).filter(Boolean) ?? [];
  const province = parts[0] ? provinceNames[parts[0]] : undefined;
  if (!province) return inferKoreanRegion(value ?? undefined);
  return inferKoreanRegion(province, ...parts.slice(1));
}

export function parseTtaDivisionSearchResponse(value: unknown, expectedName: string, observedAt: string): NormalizedRecord[] {
  const response = ttaDivisionSearchResponseSchema.parse(value);
  const normalizedExpectedName = normalizePlayerName(expectedName);
  return response.result.flatMap((row) => {
    if (normalizePlayerName(row.memberNm) !== normalizedExpectedName) return [];
    const region = normalizeOfficialRegion(row.sigunguFormalNm);
    return [withRecordHashes({
      sourceCode: 'ttadivision',
      externalPlayerId: row.memberSeq,
      sourceIdentityKey: stableHash({ sourceCode: 'ttadivision', externalPlayerId: row.memberSeq }),
      playerName: row.memberNm,
      normalizedPlayerName: normalizedExpectedName,
      ...(row.oteamFnm?.trim() ? { clubText: row.oteamFnm.trim() } : {}),
      ...(region ? { region } : {}),
      tournamentName: '대한탁구협회 디비전 선수등록',
      eventName: '디비전 선수 등급',
      eventType: 'unknown',
      divisionSystem: 'division',
      divisionValue: row.dlPlyrGrd,
      sourceUrl: TTA_DIVISION_SEARCH_URL,
      observedAt,
    })];
  });
}
