import type { NormalizedRecord } from './models';
import { normalizeComparableText, normalizeSearchText } from './normalization';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
  return `{${entries.join(',')}}`;
}

// FNV-1a 64-bit is deterministic across browser, Node and Deno. It is a change key, not a security primitive.
export function stableHash(value: JsonValue): string {
  const input = canonicalJson(value);
  let hash = 0xcbf29ce484222325n;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export type RecordHashInput = Omit<NormalizedRecord, 'naturalKeyHash' | 'contentHash'>;

export function createNaturalKeyHash(record: RecordHashInput): string {
  return stableHash({
    sourceCode: record.sourceCode,
    playerIdentity: record.externalPlayerId ?? record.sourceIdentityKey ?? record.normalizedPlayerName,
    tournamentDate: record.tournamentDate ?? null,
    tournamentName: normalizeSearchText(record.tournamentName),
    eventName: normalizeSearchText(record.eventName),
    eventType: record.eventType,
  });
}

export function createContentHash(record: RecordHashInput): string {
  return stableHash({
    clubText: normalizeComparableText(record.clubText) ?? null,
    divisionSystem: normalizeComparableText(record.divisionSystem) ?? null,
    divisionValue: normalizeComparableText(record.divisionValue) ?? null,
    rankText: normalizeComparableText(record.rankText) ?? null,
    partnerText: normalizeComparableText(record.partnerText) ?? null,
  });
}

export function withRecordHashes(record: RecordHashInput): NormalizedRecord {
  return { ...record, naturalKeyHash: createNaturalKeyHash(record), contentHash: createContentHash(record) };
}
