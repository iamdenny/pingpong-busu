import {
  compareNormalizedRecordsByLatest,
  isAwardRank,
  normalizedRecordDate,
  normalizeSearchText,
  stableHash,
  summarizeDivisionObservations,
  type NormalizedRecord,
  type PlayerDetail,
  type PlayerRecord,
  type SourceCode,
} from "@busu/domain";

function inferScale(tournamentName: string): PlayerRecord["scale"] {
  if (tournamentName.includes("전국")) return "national";
  if (tournamentName.includes("도") || tournamentName.includes("광역시"))
    return "province";
  if (tournamentName.includes("구") || tournamentName.includes("시"))
    return "district";
  return "unknown";
}

export function recordsToPlayerDetails(
  records: readonly NormalizedRecord[],
  sourceCode: SourceCode,
  sourceName: string,
): PlayerDetail[] {
  const groups = new Map<string, NormalizedRecord[]>();
  for (const record of records) {
    const identityKey =
      record.sourceIdentityKey ??
      stableHash({
        sourceCode,
        name: record.normalizedPlayerName,
        club: normalizeSearchText(record.clubText ?? ""),
      });
    groups.set(identityKey, [...(groups.get(identityKey) ?? []), record]);
  }
  return [...groups.entries()].map(([identityKey, group]) => {
    const sorted = [...group].sort(compareNormalizedRecordsByLatest);
    const latest = sorted[0];
    if (!latest) throw new Error("record group cannot be empty");
    const lastCheckedAt =
      sorted
        .map((record) => record.observedAt)
        .sort()
        .at(-1) ?? latest.observedAt;
    const awards = sorted.filter((record) => isAwardRank(record.rankText));
    const awardResults = awards.flatMap((record) => {
      if (!record.rankText) return [];
      const date = normalizedRecordDate(record);
      return [
        {
          rank: record.rankText,
          ...(date ? { date } : {}),
          tournament: record.tournamentName,
          lastCheckedAt: record.observedAt,
        },
      ];
    });
    const playerRecords: PlayerRecord[] = sorted.map((record) => {
      const date = normalizedRecordDate(record);
      return {
        id: record.naturalKeyHash,
        ...(date ? { date } : {}),
        ...(record.tournamentDate
          ? { dateBasis: "tournament" as const }
          : record.sourcePublishedDate
            ? { dateBasis: "published" as const }
            : {}),
        tournament: record.tournamentName,
        scale: inferScale(record.tournamentName),
        event: record.eventName,
        ...(record.clubText ? { club: record.clubText } : {}),
        ...(record.divisionValue ? { division: record.divisionValue } : {}),
        ...(record.divisionSystem
          ? { divisionSystem: record.divisionSystem }
          : {}),
        ...(record.rankText ? { rank: record.rankText } : {}),
        sourceCode,
        sourceName,
        sourceUrl: record.sourceUrl,
        lastCheckedAt: record.observedAt,
      };
    });
    const latestDate = normalizedRecordDate(latest);
    return {
      id: `${sourceCode}-${identityKey}`,
      name: latest.playerName,
      normalizedName: latest.normalizedPlayerName,
      ...(latest.clubText ? { club: latest.clubText } : {}),
      ...(latest.region ? { region: latest.region } : {}),
      ...(latest.divisionValue
        ? { recentObservedDivision: latest.divisionValue }
        : {}),
      ...(latest.divisionSystem
        ? { recentObservedDivisionSystem: latest.divisionSystem }
        : {}),
      resultCount: awards.length,
      awardResults,
      divisionObservations: summarizeDivisionObservations(playerRecords),
      sourceCount: 1,
      lastCheckedAt,
      identityStatus: "unreviewed",
      dataKind: "live",
      records: playerRecords,
      sources: [
        {
          sourceCode,
          sourceName,
          ...(latestDate ? { latestRecordDate: latestDate } : {}),
          ...(latest.clubText ? { latestClub: latest.clubText } : {}),
          ...(latest.divisionValue
            ? { recentObservedDivision: latest.divisionValue }
            : {}),
          ...(latest.divisionSystem
            ? { recentObservedDivisionSystem: latest.divisionSystem }
            : {}),
          resultCount: awards.length,
          ...(awards[0]?.rankText ? { latestRank: awards[0].rankText } : {}),
          lastCheckedAt,
          status: "fresh",
        },
      ],
    };
  });
}
