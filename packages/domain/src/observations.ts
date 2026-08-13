import type {
  DivisionObservationSummary,
  DivisionSystem,
  PlayerRecord,
} from "./models";

export function isAwardRank(rankText?: string): boolean {
  if (rankText === undefined) return false;
  const normalized = rankText.normalize("NFKC").replace(/\s+/gu, "");
  if (/(?:예선|조별)/u.test(normalized)) return false;
  return (
    normalized.includes("우승") ||
    /(?:^|[^0-9])[123]위(?:$|[^0-9])/u.test(normalized) ||
    /(?:^|[^0-9])(?:2|4)강(?:$|[^0-9])/u.test(normalized)
  );
}

export function summarizeDivisionObservations(
  records: readonly Pick<
    PlayerRecord,
    "division" | "divisionSystem" | "rank"
  >[],
): DivisionObservationSummary[] {
  const counts = new Map<
    string,
    {
      system: DivisionSystem;
      division: string;
      awardCount: number;
      participationCount: number;
    }
  >();
  for (const record of records) {
    const division = record.division?.trim();
    if (!division) continue;
    const system = record.divisionSystem ?? "unknown";
    const key = `${system}\u0000${division}`;
    const current = counts.get(key) ?? {
      system,
      division,
      awardCount: 0,
      participationCount: 0,
    };
    if (isAwardRank(record.rank)) current.awardCount += 1;
    else current.participationCount += 1;
    counts.set(key, current);
  }
  return [...counts.values()];
}
