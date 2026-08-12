import { describe, expect, it } from 'vitest';
import type { DivisionSystem, PlayerSummary } from '@busu/domain';
import { summarizeObservedDivisions } from './divisionSummary';

function player(id: string, recentObservedDivision?: string, recentObservedDivisionSystem?: DivisionSystem): PlayerSummary {
  return {
    id,
    name: '임대현',
    normalizedName: '임대현',
    ...(recentObservedDivision ? { recentObservedDivision } : {}),
    ...(recentObservedDivisionSystem ? { recentObservedDivisionSystem } : {}),
    resultCount: 1,
    sourceCount: 1,
    lastCheckedAt: '2026-08-12T00:00:00.000Z',
    identityStatus: 'unreviewed',
  };
}

describe('summarizeObservedDivisions', () => {
  it('keeps equal division values separate across division systems', () => {
    expect(summarizeObservedDivisions([
      player('1', '6부', 'open'),
      player('2', '6부', 'regional'),
      player('3', '6부', 'open'),
      player('4'),
      player('5', '4부', 'women'),
      player('6', 'T5', 'division'),
    ])).toEqual([
      { system: 'open', systemLabel: '오픈부수', division: '6부', count: 2 },
      { system: 'women', systemLabel: '여자부수', division: '4부', count: 1 },
      { system: 'regional', systemLabel: '지역부수', division: '6부', count: 1 },
      { system: 'division', systemLabel: '디비전부수', division: 'T5', count: 1 },
      { system: 'unknown', systemLabel: '체계 확인 필요', division: '확인 필요', count: 1 },
    ]);
  });
});
