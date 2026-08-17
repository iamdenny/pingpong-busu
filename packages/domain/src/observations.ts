import type {
  DivisionObservationSummary,
  DivisionSystem,
  PlayerRecord,
} from "./models";
import { sortPlayerRecordsByLatest } from "./chronology";
import { isPreIntegratedDivisionRecord } from "./division-overrides";
import {
  normalizePlayerRecordDivisionSystem,
  prioritizeWomenDivisionSystem,
} from "./division";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isFutureTournamentRecord(
  record: Pick<PlayerRecord, "date" | "dateBasis">,
  today = todayIsoDate(),
): boolean {
  return (
    record.dateBasis === "tournament" &&
    record.date !== undefined &&
    record.date > today
  );
}

export function isCurrentSummaryRecord(
  record: Pick<
    PlayerRecord,
    "date" | "dateBasis" | "tournamentRegion" | "divisionSystem"
  > &
    Partial<Pick<PlayerRecord, "tournament">>,
  today = todayIsoDate(),
): boolean {
  return (
    !isPreIntegratedDivisionRecord(record) &&
    !isFutureTournamentRecord(record, today)
  );
}

export function isIndividualDivisionRecord(
  record: Partial<Pick<PlayerRecord, "event" | "eventType">>,
): boolean {
  if (record.eventType === "doubles" || record.eventType === "team") {
    return false;
  }

  return !/(?:복식|단체|혼합|혼성)/u.test(
    (record.event ?? "").normalize("NFKC"),
  );
}

export function isCurrentDivisionSummaryRecord(
  record: Pick<
    PlayerRecord,
    "date" | "dateBasis" | "tournamentRegion" | "divisionSystem"
  > &
    Partial<Pick<PlayerRecord, "tournament" | "event" | "eventType">>,
  today = todayIsoDate(),
): boolean {
  return (
    isCurrentSummaryRecord(record, today) && isIndividualDivisionRecord(record)
  );
}

function isStandardDivisionSystem(system?: DivisionSystem): boolean {
  return system === "integrated" || system === "women";
}

export function findRecentObservedDivisionRecord(
  records: readonly PlayerRecord[],
  today = todayIsoDate(),
): PlayerRecord | undefined {
  const eligible = sortPlayerRecordsByLatest(
    records
      .filter(
        (record) =>
          record.division !== undefined &&
          isCurrentDivisionSummaryRecord(record, today),
      )
      .map(normalizePlayerRecordDivisionSystem),
  );
  const latest = eligible[0];
  if (!latest) return undefined;

  return (
    eligible.find(
      (record) =>
        record.date === latest.date &&
        isStandardDivisionSystem(record.divisionSystem),
    ) ?? latest
  );
}

export function findRecentObservedDivisionRecordForSystems(
  records: readonly PlayerRecord[],
  systems: readonly DivisionSystem[],
  today = todayIsoDate(),
): PlayerRecord | undefined {
  const allowedSystems = new Set(systems);
  return findRecentObservedDivisionRecord(
    records
      .map(normalizePlayerRecordDivisionSystem)
      .filter(
        (record) =>
          record.divisionSystem !== undefined &&
          allowedSystems.has(record.divisionSystem),
      ),
    today,
  );
}

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

type SummarizableRecord = Pick<
  PlayerRecord,
  | "date"
  | "dateBasis"
  | "tournamentRegion"
  | "division"
  | "divisionSystem"
  | "rank"
> &
  Partial<Pick<PlayerRecord, "tournament" | "event" | "eventType">>;

function summarizeObservations(
  records: ReadonlyArray<SummarizableRecord>,
  includes: (record: SummarizableRecord) => boolean,
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
    if (!includes(record)) continue;
    const division = record.division?.trim();
    if (!division) continue;
    const system =
      prioritizeWomenDivisionSystem(
        record.divisionSystem,
        record.event,
        division,
      ) ?? "unknown";
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

/** 현재 추정 부수와 같은 기준의 개인전 관측만 집계한다. */
export function summarizeDivisionObservations(
  records: ReadonlyArray<SummarizableRecord>,
  today = todayIsoDate(),
): DivisionObservationSummary[] {
  return summarizeObservations(records, (record) =>
    isCurrentDivisionSummaryRecord(record, today),
  );
}

/** 부수 집계에서 제외하는 단체·복식·혼성 관측만 따로 집계한다. */
export function summarizeNonIndividualDivisionObservations(
  records: ReadonlyArray<SummarizableRecord>,
  today = todayIsoDate(),
): DivisionObservationSummary[] {
  return summarizeObservations(
    records,
    (record) =>
      isCurrentSummaryRecord(record, today) &&
      !isIndividualDivisionRecord(record),
  );
}
