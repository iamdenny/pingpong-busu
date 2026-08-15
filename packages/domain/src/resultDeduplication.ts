import { stableHash } from "./hashing";
import type { PlayerRecord, ResultSourceEvidence } from "./models";

function normalizeDisplayText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s[\](){}<>/~·,._&+:-]+/gu, "");
}

function normalizeEventForDisplayFingerprint(value: string): string {
  const normalized = value.normalize("NFKC");
  const prefix = /^(?:\s*\[[^\]]+\]\s*)+/u.exec(normalized)?.[0] ?? "";
  const remainder = normalized.slice(prefix.length);
  const prefixHasGender = /[남여혼]/u.test(prefix);
  const remainderHasGender = /(남자|여자|여성|혼성|혼합)/u.test(remainder);
  return normalizeDisplayText(
    prefixHasGender && !remainderHasGender ? normalized : remainder,
  );
}

function normalizeRank(value: string | undefined): string {
  const normalized = normalizeDisplayText(value);
  if (normalized === "우승") return "1위";
  if (normalized === "준우승") return "2위";
  return normalized;
}

export function resultDisplayFingerprint(
  record: Pick<
    PlayerRecord,
    | "date"
    | "dateBasis"
    | "tournament"
    | "event"
    | "eventType"
    | "divisionSystem"
    | "division"
    | "rank"
  > &
    Partial<Pick<PlayerRecord, "partner">>,
): string | undefined {
  if (!record.date || record.dateBasis !== "tournament") return undefined;
  const tournament = normalizeDisplayText(record.tournament);
  const division = normalizeDisplayText(record.division);
  const rank = normalizeRank(record.rank);
  if (!tournament || !division || !rank) return undefined;
  return JSON.stringify([
    record.date,
    tournament,
    normalizeEventForDisplayFingerprint(record.event),
    record.eventType ?? "unknown",
    record.divisionSystem ?? "unknown",
    division,
    rank,
    normalizeDisplayText(record.partner),
  ]);
}

function evidenceFor(record: PlayerRecord): ResultSourceEvidence[] {
  return record.sources?.length
    ? record.sources
    : [
        {
          sourceCode: record.sourceCode,
          sourceName: record.sourceName,
          sourceUrl: record.sourceUrl,
          lastCheckedAt: record.lastCheckedAt,
          originalRecordId: record.id,
        },
      ];
}

function compareEvidence(
  left: ResultSourceEvidence,
  right: ResultSourceEvidence,
): number {
  return (
    right.lastCheckedAt.localeCompare(left.lastCheckedAt) ||
    left.sourceCode.localeCompare(right.sourceCode) ||
    left.originalRecordId.localeCompare(right.originalRecordId)
  );
}

export function deduplicatePlayerRecords(
  records: readonly PlayerRecord[],
): PlayerRecord[] {
  const buckets = new Map<string, PlayerRecord[]>();
  for (const record of records) {
    const fingerprint = resultDisplayFingerprint(record);
    if (!fingerprint) continue;
    buckets.set(fingerprint, [...(buckets.get(fingerprint) ?? []), record]);
  }

  const grouped = new Map<string, PlayerRecord[]>();
  for (const [fingerprint, bucket] of buckets) {
    const evidence = bucket.flatMap(evidenceFor).sort(compareEvidence);
    const sourceCodes = evidence.map((item) => item.sourceCode);
    if (new Set(sourceCodes).size !== sourceCodes.length) {
      grouped.set(fingerprint, bucket);
      continue;
    }
    const primaryEvidence = evidence[0];
    const primary = [...bucket].sort(
      (left, right) =>
        right.lastCheckedAt.localeCompare(left.lastCheckedAt) ||
        left.sourceCode.localeCompare(right.sourceCode) ||
        left.id.localeCompare(right.id),
    )[0];
    if (!primary || !primaryEvidence) {
      grouped.set(fingerprint, bucket);
      continue;
    }
    grouped.set(fingerprint, [
      {
        ...primary,
        id: `display-${stableHash(fingerprint)}`,
        sourceCode: primaryEvidence.sourceCode,
        sourceName: primaryEvidence.sourceName,
        sourceUrl: primaryEvidence.sourceUrl,
        lastCheckedAt: primaryEvidence.lastCheckedAt,
        sources: evidence,
      },
    ]);
  }

  const emitted = new Set<string>();
  return records.flatMap((record) => {
    const fingerprint = resultDisplayFingerprint(record);
    if (!fingerprint) return [record];
    const displayBucket = grouped.get(fingerprint) ?? [record];
    if (displayBucket.length > 1) return [record];
    if (emitted.has(fingerprint)) return [];
    emitted.add(fingerprint);
    return displayBucket;
  });
}
