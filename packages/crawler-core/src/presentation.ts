import {
  compareNormalizedRecordsByLatest,
  findRecentObservedDivisionRecord,
  isAwardRank,
  normalizePlayerRecordDivisionSystem,
  isCurrentSummaryRecord,
  normalizedRecordDate,
  normalizeSearchText,
  stableHash,
  summarizeDivisionObservations,
  deduplicatePlayerRecords,
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
    const playerRecords: PlayerRecord[] = sorted.map((record) => {
      const date = normalizedRecordDate(record);
      return normalizePlayerRecordDivisionSystem({
        id: record.naturalKeyHash,
        ...(date ? { date } : {}),
        ...(record.tournamentDate
          ? { dateBasis: "tournament" as const }
          : record.sourcePublishedDate
            ? { dateBasis: "published" as const }
            : {}),
        ...(record.tournamentRegion
          ? { tournamentRegion: record.tournamentRegion }
          : {}),
        tournament: record.tournamentName,
        scale: inferScale(record.tournamentName),
        event: record.eventName,
        eventType: record.eventType,
        ...(record.clubText ? { club: record.clubText } : {}),
        ...(record.divisionValue ? { division: record.divisionValue } : {}),
        ...(record.divisionSystem
          ? { divisionSystem: record.divisionSystem }
          : {}),
        ...(record.rankText ? { rank: record.rankText } : {}),
        ...(record.partnerText ? { partner: record.partnerText } : {}),
        sourceCode: record.sourceCode,
        sourceName:
          record.sourceCode === sourceCode ? sourceName : record.sourceCode,
        sourceUrl: record.sourceUrl,
        lastCheckedAt: record.observedAt,
      });
    });
    const displayRecords = deduplicatePlayerRecords(playerRecords);
    const currentSummaryRecords = displayRecords.filter((record) =>
      isCurrentSummaryRecord(record),
    );
    const currentAwardRecords = currentSummaryRecords.filter((record) =>
      isAwardRank(record.rank),
    );
    const awardResults = currentAwardRecords.flatMap((record) =>
      record.rank
        ? [
            {
              rank: record.rank,
              ...(record.date ? { date: record.date } : {}),
              tournament: record.tournament,
              event: record.event,
              lastCheckedAt: record.lastCheckedAt,
            },
          ]
        : [],
    );
    const latestCurrentDivisionRecord =
      findRecentObservedDivisionRecord(displayRecords);
    const latestSummaryRecord = currentSummaryRecords[0];
    return {
      id: `${sourceCode}-${identityKey}`,
      name: latest.playerName,
      normalizedName: latest.normalizedPlayerName,
      ...(latest.clubText ? { club: latest.clubText } : {}),
      ...(latest.region ? { region: latest.region } : {}),
      ...(latestCurrentDivisionRecord?.division
        ? { recentObservedDivision: latestCurrentDivisionRecord.division }
        : {}),
      ...(latestCurrentDivisionRecord?.divisionSystem
        ? {
            recentObservedDivisionSystem:
              latestCurrentDivisionRecord.divisionSystem,
          }
        : {}),
      resultCount: currentAwardRecords.length,
      awardResults,
      divisionObservations: summarizeDivisionObservations(displayRecords),
      sourceCount: 1,
      lastCheckedAt,
      identityStatus: "unreviewed",
      dataKind: "live",
      records: displayRecords,
      sources: [
        {
          sourceCode,
          sourceName,
          ...(latestSummaryRecord?.date
            ? { latestRecordDate: latestSummaryRecord.date }
            : {}),
          ...(latest.clubText ? { latestClub: latest.clubText } : {}),
          ...(latestCurrentDivisionRecord?.division
            ? { recentObservedDivision: latestCurrentDivisionRecord.division }
            : {}),
          ...(latestCurrentDivisionRecord?.divisionSystem
            ? {
                recentObservedDivisionSystem:
                  latestCurrentDivisionRecord.divisionSystem,
              }
            : {}),
          resultCount: currentAwardRecords.length,
          ...(currentAwardRecords[0]?.rank
            ? { latestRank: currentAwardRecords[0].rank }
            : {}),
          lastCheckedAt,
          status: "fresh",
        },
      ],
    };
  });
}
