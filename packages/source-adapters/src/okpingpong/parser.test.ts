import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { parseOkPingpongSearchHtml } from './parser';

const fixture = readFileSync(resolve(import.meta.dirname, '../../../../fixtures/sources/okpingpong/search-result.html'), 'utf8');

describe('오케이핑퐁 parser', () => {
  it('carries rowspan identity fields into subsequent synthetic events', () => {
    const records = parseOkPingpongSearchHtml(fixture, '홍라켓', '2026-08-12T00:00:00.000Z');
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ sourceCode: 'okpingpong', clubText: '합성올빼미', region: '강원특별자치도 정선군', tournamentDate: '2026-06-20', eventType: 'singles', divisionValue: '6부', rankText: '본선 8강' });
    expect(records[1]).toMatchObject({ eventType: 'team', rankText: '본선 4강' });
    expect(records[0]?.sourceIdentityKey).toBe(records[1]?.sourceIdentityKey);
  });

  it('separates empty results and schema changes', () => {
    const empty = '<form id="playerSearchForm"></form><table class="result_tbl_total"><tbody></tbody></table>';
    expect(parseOkPingpongSearchHtml(empty, '홍라켓', '2026-08-12T00:00:00.000Z')).toEqual([]);
    expect(() => parseOkPingpongSearchHtml('<html></html>', '홍라켓', '2026-08-12T00:00:00.000Z')).toThrow(SourceSchemaChangedError);
  });
});
