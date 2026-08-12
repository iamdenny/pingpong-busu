import { decideRecordUpsert, type MutableRecordField, type NormalizedRecord } from '@busu/domain';

export interface Revision { naturalKeyHash: string; previous: NormalizedRecord; next: NormalizedRecord; changedFields: MutableRecordField[]; detectedAt: string; }
export interface UpsertSummary { inserted: number; updated: number; unchanged: number; }

export class InMemoryRecordRepository {
  readonly records = new Map<string, NormalizedRecord>();
  readonly revisions: Revision[] = [];

  upsertMany(records: readonly NormalizedRecord[], now = new Date().toISOString()): UpsertSummary {
    const summary = { inserted: 0, updated: 0, unchanged: 0 };
    for (const next of records) {
      const decision = decideRecordUpsert(this.records.get(next.naturalKeyHash), next);
      if (decision.kind === 'insert') { this.records.set(next.naturalKeyHash, next); summary.inserted += 1; }
      if (decision.kind === 'unchanged') summary.unchanged += 1;
      if (decision.kind === 'update') {
        this.revisions.push({ naturalKeyHash: next.naturalKeyHash, previous: decision.previous, next, changedFields: decision.changedFields, detectedAt: now });
        this.records.set(next.naturalKeyHash, next); summary.updated += 1;
      }
    }
    return summary;
  }
}

export function refreshBucket(date: Date, cooldownSeconds: number): number {
  return Math.floor(date.getTime() / (cooldownSeconds * 1000));
}
export class RefreshJobDeduplicator {
  private readonly keys = new Set<string>();
  enqueue(source: string, queryKey: string, bucket: number): boolean {
    const key = `${source}:${queryKey}:${bucket}`;
    if (this.keys.has(key)) return false;
    this.keys.add(key); return true;
  }
}
