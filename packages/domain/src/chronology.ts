import type { NormalizedRecord, PlayerRecord } from './models';

export function normalizedRecordDate(record: Pick<NormalizedRecord, 'tournamentDate' | 'sourcePublishedDate'>): string | undefined {
  return record.tournamentDate ?? record.sourcePublishedDate;
}

export function compareNormalizedRecordsByLatest(left: NormalizedRecord, right: NormalizedRecord): number {
  const dateDifference = (normalizedRecordDate(right) ?? '').localeCompare(normalizedRecordDate(left) ?? '');
  if (dateDifference !== 0) return dateDifference;

  const observedDifference = right.observedAt.localeCompare(left.observedAt);
  if (observedDifference !== 0) return observedDifference;

  return right.naturalKeyHash.localeCompare(left.naturalKeyHash);
}

export function playerRecordDate(record: Pick<PlayerRecord, 'date'>): string | undefined {
  return record.date;
}

export function comparePlayerRecordsByLatest(left: PlayerRecord, right: PlayerRecord): number {
  const dateDifference = (playerRecordDate(right) ?? '').localeCompare(playerRecordDate(left) ?? '');
  if (dateDifference !== 0) return dateDifference;

  const checkedDifference = right.lastCheckedAt.localeCompare(left.lastCheckedAt);
  if (checkedDifference !== 0) return checkedDifference;

  return right.id.localeCompare(left.id);
}

export function sortPlayerRecordsByLatest(records: readonly PlayerRecord[]): PlayerRecord[] {
  return [...records].sort(comparePlayerRecordsByLatest);
}
