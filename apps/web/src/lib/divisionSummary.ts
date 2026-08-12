import { divisionSystemLabels, type DivisionSystem, type PlayerSummary } from '@busu/domain';

export interface DivisionSummaryItem {
  system: DivisionSystem;
  systemLabel: string;
  division: string;
  count: number;
}

const systemOrder: DivisionSystem[] = ['open', 'integrated', 'women', 'regional', 'division', 'unknown'];

export function summarizeObservedDivisions(players: readonly PlayerSummary[]): DivisionSummaryItem[] {
  const counts = new Map<string, number>();
  for (const player of players) {
    const system = player.recentObservedDivisionSystem ?? 'unknown';
    const division = player.recentObservedDivision ?? '확인 필요';
    const key = `${system}\u0000${division}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => {
      const [systemValue, division = '확인 필요'] = key.split('\u0000');
      const system = systemValue as DivisionSystem;
      return { system, systemLabel: divisionSystemLabels[system], division, count };
    })
    .sort((left, right) => systemOrder.indexOf(left.system) - systemOrder.indexOf(right.system)
      || right.count - left.count
      || left.division.localeCompare(right.division, 'ko-KR', { numeric: true }));
}
