import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSuperstarSearchHtml } from './parser';

const fixture = readFileSync(resolve(import.meta.dirname, '../../../../fixtures/sources/superstar/search-result.html'), 'utf8');

describe('parseSuperstarSearchHtml', () => {
  it('normalizes public individual results without collecting rating or contact fields', () => {
    const records = parseSuperstarSearchHtml(fixture, '홍라켓', '2026-08-12T00:00:00.000Z');
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ sourceCode: 'superstar', externalPlayerId: '남 9001', playerName: '홍라켓', tournamentDate: '2026-07-18', region: '경기도 용인시', divisionSystem: 'women', divisionValue: '5부', rankText: '4강' });
    expect(records[1]).toMatchObject({ divisionSystem: 'open', divisionValue: '6부', rankText: '16강' });
    expect(records[2]).toMatchObject({ externalPlayerId: '-12001', divisionSystem: 'integrated', divisionValue: '7부', rankText: '우승' });
    expect(records.every((record) => record.sourceUrl.includes('userNm=%ED%99%8D%EB%9D%BC%EC%BC%93'))).toBe(true);
  });
});
