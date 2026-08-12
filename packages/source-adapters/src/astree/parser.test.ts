import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { parseAstreeSearchHtml } from './parser';

const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname, '../../../../fixtures/sources/astree', name), 'utf8');

describe('Astree parser', () => {
  it('parses synthetic singles and doubles records', () => {
    const records = parseAstreeSearchHtml(fixture('search-result.html'), '홍라켓', '2026-08-12T00:00:00.000Z');
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ playerName: '홍라켓', clubText: '가상드라이브클럽', region: '경기도 수원시', tournamentName: '2026 수원시 합성 탁구대회', tournamentDate: '2026-07-18', eventType: 'singles', divisionSystem: 'integrated', divisionValue: '6부', rankText: '준우승' });
    expect(records[1]).toMatchObject({ eventType: 'doubles', rankText: '본선 8강' });
    expect(records[2]).toMatchObject({ eventType: 'singles', divisionSystem: 'women' });
    expect(records[2]?.divisionValue).toBeUndefined();
    expect(records[0]?.sourceUrl).toMatch(/^https:\/\/astree\.co\.kr\/bbs\/board\.php\?/u);
    expect(records[0]?.naturalKeyHash).not.toBe(records[1]?.naturalKeyHash);
  });
  it('returns an actual empty result separately from a schema change', () => {
    expect(parseAstreeSearchHtml(fixture('empty-result.html'), '홍라켓', '2026-08-12T00:00:00.000Z')).toEqual([]);
    expect(() => parseAstreeSearchHtml('<html></html>', '홍라켓', '2026-08-12T00:00:00.000Z')).toThrow(SourceSchemaChangedError);
  });
  it('does not merge another player with the same result page', () => {
    expect(parseAstreeSearchHtml(fixture('search-result.html'), '동명이인', '2026-08-12T00:00:00.000Z')).toEqual([]);
  });
});
