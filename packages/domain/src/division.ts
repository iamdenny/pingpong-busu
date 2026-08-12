import type { DivisionSystem } from './models';

export const divisionSystemLabels: Record<DivisionSystem, string> = {
  open: '오픈부수',
  integrated: '통합부수',
  women: '통합부수',
  regional: '지역부수',
  division: '디비전부수',
  unknown: '체계 확인 필요',
};

export function displayDivisionValue(system: DivisionSystem | undefined, value: string | undefined): string {
  const normalized = value?.normalize('NFKC').trim();
  const observed = !normalized || /^(?:NULL|UNDEFINED|NONE|N\/?A)(?:부)?$/iu.test(normalized) ? '확인 필요' : normalized;
  if (system !== 'women' || observed === '확인 필요' || observed.startsWith('여자')) return observed;
  return `여자${observed}`;
}

export function formatDivisionObservation(system: DivisionSystem | undefined, value: string | undefined): string {
  const observed = displayDivisionValue(system, value);
  return system ? `${divisionSystemLabels[system]} ${observed}` : observed;
}

export function parseDivisionSystem(value?: string | null): DivisionSystem | undefined {
  if (!value) return undefined;
  if (value === 'open' || /오픈/u.test(value)) return 'open';
  if (value === 'integrated' || /통합/u.test(value)) return 'integrated';
  if (value === 'women' || /(?:여자|여성)/u.test(value)) return 'women';
  if (value === 'regional' || /지역\s*부수/u.test(value)) return 'regional';
  if (value === 'division' || /디비전/u.test(value)) return 'division';
  if (value === 'unknown') return 'unknown';
  return undefined;
}

export function inferDivisionSystem(...evidence: Array<string | undefined>): DivisionSystem {
  const text = evidence.filter((value): value is string => value !== undefined).join(' ').normalize('NFKC');
  if (/디비전|(?:^|\s)T[1-7](?=\s|$)/iu.test(text)) return 'division';
  if (/(?:여자|여성)/u.test(text)) return 'women';
  if (/오픈/u.test(text)) return 'open';
  if (/지역\s*부수/u.test(text)) return 'regional';
  if (/통합\s*(?:부수|\d+\s*부)/u.test(text)) return 'integrated';
  if (/(?:\d+|[A-Z])\s*부(?:수)?/iu.test(text)) return 'integrated';
  return 'unknown';
}
