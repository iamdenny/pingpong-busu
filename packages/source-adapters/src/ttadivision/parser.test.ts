import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTtaDivisionSearchResponse } from './parser';

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../fixtures/sources/ttadivision/search-result.json'), 'utf8')) as unknown;

describe('대한탁구협회 디비전 parser', () => {
  it('keeps same-name identities separate and extracts T grades without private fields', () => {
    const records = parseTtaDivisionSearchResponse(fixture, '홍라켓', '2026-08-12T00:00:00.000Z');
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ sourceCode: 'ttadivision', externalPlayerId: 'synthetic-1', region: '경기도 부천시', clubText: '합성올빼미', divisionSystem: 'division', divisionValue: 'T5' });
    expect(records[1]).toMatchObject({ sourceCode: 'ttadivision', externalPlayerId: 'synthetic-2', divisionValue: 'T7' });
    expect(records[0]).not.toHaveProperty('memberCell');
    expect(records[0]?.sourceIdentityKey).not.toBe(records[1]?.sourceIdentityKey);
  });
});
