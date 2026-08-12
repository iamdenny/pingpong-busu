import type { NormalizedRecord } from './models';

export type MutableRecordField = 'clubText' | 'divisionSystem' | 'divisionValue' | 'rankText' | 'partnerText';
export const mutableRecordFields: readonly MutableRecordField[] = [
  'clubText',
  'divisionSystem',
  'divisionValue',
  'rankText',
  'partnerText',
];

export function changedRecordFields(previous: NormalizedRecord, next: NormalizedRecord): MutableRecordField[] {
  return mutableRecordFields.filter((field) => previous[field] !== next[field]);
}

export type UpsertDecision =
  | { kind: 'insert'; next: NormalizedRecord }
  | { kind: 'unchanged'; current: NormalizedRecord }
  | { kind: 'update'; previous: NormalizedRecord; next: NormalizedRecord; changedFields: MutableRecordField[] };

export function decideRecordUpsert(current: NormalizedRecord | undefined, next: NormalizedRecord): UpsertDecision {
  if (current === undefined) return { kind: 'insert', next };
  if (current.naturalKeyHash !== next.naturalKeyHash) return { kind: 'insert', next };
  if (current.contentHash === next.contentHash) return { kind: 'unchanged', current };
  return { kind: 'update', previous: current, next, changedFields: changedRecordFields(current, next) };
}
