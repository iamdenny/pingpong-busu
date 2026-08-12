import { describe, expect, it } from 'vitest';
import { normalizePlayerName, withRecordHashes, type RecordHashInput } from '@busu/domain';
import { InMemoryRecordRepository, RefreshJobDeduplicator, SourceDisabledError, mapSourceError, recordsToPlayerDetails } from './index';

const record = (divisionValue: string): RecordHashInput => ({ sourceCode: 'mock', externalPlayerId: '1', playerName: '김탁구', normalizedPlayerName: normalizePlayerName('김탁구'), tournamentName: '가상대회', eventName: '단식', eventType: 'singles', divisionValue, sourceUrl: 'https://example.invalid/1', observedAt: '2026-08-12T00:00:00.000Z' });

describe('crawler state', () => {
  it('deduplicates jobs and handles same/changed records', () => {
    const jobs = new RefreshJobDeduplicator(); expect(jobs.enqueue('mock', '김탁구', 1)).toBe(true); expect(jobs.enqueue('mock', '김탁구', 1)).toBe(false);
    const repository = new InMemoryRecordRepository();
    expect(repository.upsertMany([withRecordHashes(record('5부'))])).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    expect(repository.upsertMany([withRecordHashes(record('5부'))])).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    expect(repository.upsertMany([withRecordHashes(record('4부'))])).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    expect(repository.revisions[0]?.changedFields).toEqual(['divisionValue']);
  });
  it('maps timeout and preserves disabled errors', () => {
    expect(mapSourceError(new DOMException('aborted', 'AbortError')).code).toBe('source_timeout');
    expect(mapSourceError(new SourceDisabledError()).code).toBe('source_disabled');
  });

  it('presents records by event date, then source publication date', () => {
    const identity = { sourceCode: 'mock' as const, externalPlayerId: '1', playerName: '김탁구', normalizedPlayerName: normalizePlayerName('김탁구'), eventName: '단식', eventType: 'singles' as const, observedAt: '2026-08-12T00:00:00.000Z' };
    const records = [
      withRecordHashes({ ...identity, tournamentName: '과거 대회', tournamentDate: '2025-01-01', sourceUrl: 'https://example.invalid/old' }),
      withRecordHashes({ ...identity, tournamentName: '최근 게시물', sourcePublishedDate: '2026-07-01', sourceUrl: 'https://example.invalid/post' }),
      withRecordHashes({ ...identity, tournamentName: '최근 대회', tournamentDate: '2026-08-01', sourcePublishedDate: '2026-08-02', sourceUrl: 'https://example.invalid/new' }),
    ];

    const detail = recordsToPlayerDetails(records, 'mock', '가상 출처')[0];
    expect(detail?.records.map(({ tournament }) => tournament)).toEqual(['최근 대회', '최근 게시물', '과거 대회']);
    expect(detail?.records[1]).toMatchObject({ date: '2026-07-01', dateBasis: 'published' });
    expect(detail?.records[0]).toMatchObject({ date: '2026-08-01', dateBasis: 'tournament' });
  });

  it('counts semifinal or better as awards and keeps lower rounds as participation', () => {
    const identity = { sourceCode: 'mock' as const, externalPlayerId: '1', playerName: '김탁구', normalizedPlayerName: normalizePlayerName('김탁구'), eventName: '단식', eventType: 'singles' as const, observedAt: '2026-08-12T00:00:00.000Z' };
    const records = [
      withRecordHashes({ ...identity, tournamentName: '4강 대회', tournamentDate: '2026-08-01', rankText: '본선 4강', sourceUrl: 'https://example.invalid/semifinal' }),
      withRecordHashes({ ...identity, tournamentName: '8강 대회', tournamentDate: '2026-07-01', rankText: '본선 8강', sourceUrl: 'https://example.invalid/quarterfinal' }),
    ];

    const detail = recordsToPlayerDetails(records, 'mock', '가상 출처')[0];
    expect(detail?.resultCount).toBe(1);
    expect(detail?.sources[0]).toMatchObject({ resultCount: 1, latestRank: '본선 4강' });
    expect(detail?.records).toHaveLength(2);
  });
});
