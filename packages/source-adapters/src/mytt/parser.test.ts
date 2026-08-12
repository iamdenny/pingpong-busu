import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SourceSchemaChangedError } from '@busu/crawler-core';
import { parseMyttSearchForm, parseMyttSearchHtml } from './parser';

const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname, '../../../../fixtures/sources/mytt', name), 'utf8');

describe('마이티티 parser', () => {
  it('extracts JSF form fields without persisting a session URL', () => {
    expect(parseMyttSearchForm(fixture('search-form.html'))).toEqual({ viewState: 'synthetic-view-state', submitButton: 'mainForm:search' });
  });

  it('parses synthetic participant and award rows', () => {
    const records = parseMyttSearchHtml(fixture('search-result.html'), '홍라켓', '2026-08-12T00:00:00.000Z');
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ sourceCode: 'mytt', clubText: '합성네트', region: '경기도 부천시', tournamentDate: '2026-07-19', divisionSystem: 'open', divisionValue: '5부', rankText: '준우승' });
    expect(records[1]).toMatchObject({ eventType: 'team', divisionSystem: 'integrated', divisionValue: '4부', rankText: '3위' });
    expect(records[2]).toMatchObject({ eventName: '여자 단식', divisionSystem: 'women', divisionValue: '3부', rankText: '8강' });
    expect(records[0]?.sourceUrl).toBe('https://mytt.kr/main/player_list.xhtml');
  });

  it('separates empty results and schema changes', () => {
    expect(parseMyttSearchHtml(fixture('empty-result.html'), '홍라켓', '2026-08-12T00:00:00.000Z')).toEqual([]);
    expect(() => parseMyttSearchHtml('<html></html>', '홍라켓', '2026-08-12T00:00:00.000Z')).toThrow(SourceSchemaChangedError);
  });
});
