import { describe, expect, it } from 'vitest';
import { normalizePlayerName } from '@busu/domain';
import { SourceParseError } from '@busu/crawler-core';
import { MockSourceAdapter } from './adapter';

const input = { name: '김탁구', normalizedName: normalizePlayerName('김탁구'), maxPages: 1, live: false };
const context = { now: () => new Date('2026-08-12T00:00:00Z'), timeoutMs: 100 };
describe('mock adapter', () => {
  it('parses version 1, version 2 and an actual empty result', async () => {
    expect((await new MockSourceAdapter(1).search(input, context)).records[0]?.divisionValue).toBe('5부');
    expect((await new MockSourceAdapter(2).search(input, context)).records[0]?.divisionValue).toBe('4부');
    expect((await new MockSourceAdapter('empty').search(input, context)).records).toEqual([]);
  });
  it('does not treat schema changes as empty results', async () => {
    await expect(new MockSourceAdapter('schema-changed').search(input, context)).rejects.toBeInstanceOf(SourceParseError);
  });
});
