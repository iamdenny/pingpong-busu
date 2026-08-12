import { normalizePlayerName, withRecordHashes, type RecordHashInput } from '@busu/domain';
import { SourceParseError, type SourceAdapter, type SourceAdapterContext, type SourceSearchInput, type SourceSearchResult } from '@busu/crawler-core';

export type MockFixtureVersion = 1 | 2 | 'empty' | 'schema-changed';

function fixture(version: MockFixtureVersion): unknown {
  if (version === 'schema-changed') return { unexpected: true };
  if (version === 'empty') return { records: [] };
  return { records: [{ externalPlayerId: 'mock-kim-seoul', playerName: '김탁구', clubText: version === 1 ? '스핀탁구클럽' : '스핀탁구센터', region: '서울', tournamentName: '2026 가상 전국오픈', tournamentDate: '2026-07-20', eventName: '남자 단식', eventType: 'singles', divisionSystem: 'open', divisionValue: version === 1 ? '5부' : '4부', rankText: '우승', sourceUrl: 'https://example.invalid/mock/result/kim-1' }] };
}

export function parseMockFixture(value: unknown, observedAt: string): ReturnType<typeof withRecordHashes>[] {
  if (typeof value !== 'object' || value === null || !('records' in value) || !Array.isArray(value.records)) throw new SourceParseError('mock fixture schema changed');
  return value.records.map((item) => {
    if (typeof item !== 'object' || item === null) throw new SourceParseError('mock record is invalid');
    const raw = item as Record<string, unknown>;
    const required = ['playerName', 'tournamentName', 'eventName', 'eventType', 'sourceUrl'] as const;
    if (required.some((key) => typeof raw[key] !== 'string')) throw new SourceParseError('mock record field is invalid');
    const optional = (key: string): string | undefined => typeof raw[key] === 'string' ? raw[key] : undefined;
    const record: RecordHashInput = {
      sourceCode: 'mock', playerName: String(raw.playerName), normalizedPlayerName: normalizePlayerName(String(raw.playerName)),
      tournamentName: String(raw.tournamentName), eventName: String(raw.eventName), eventType: raw.eventType as RecordHashInput['eventType'],
      sourceUrl: String(raw.sourceUrl), observedAt,
      ...Object.fromEntries(['externalPlayerId','clubText','region','tournamentDate','sourcePublishedDate','divisionSystem','divisionValue','rankText','partnerText'].map((key) => [key, optional(key)]).filter((entry) => entry[1] !== undefined)),
    };
    return withRecordHashes(record);
  });
}

export class MockSourceAdapter implements SourceAdapter {
  readonly sourceCode = 'mock'; readonly mode = 'http'; readonly parserVersion: string; readonly enabled = true;
  constructor(private readonly version: MockFixtureVersion = 1) { this.parserVersion = `mock-${version}`; }
  supportsLiveRefresh(): boolean { return true; }
  async search(input: SourceSearchInput, context: SourceAdapterContext): Promise<SourceSearchResult> {
    const fetchedAt = context.now().toISOString();
    const records = parseMockFixture(fixture(this.version), fetchedAt).filter((record) => record.normalizedPlayerName === input.normalizedName);
    return { sourceCode: 'mock', fetchedAt, sourceUrl: 'https://example.invalid/mock/search', records, warnings: [], parserVersion: this.parserVersion };
  }
}
