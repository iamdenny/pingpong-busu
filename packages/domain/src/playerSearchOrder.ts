import type { PlayerSummary } from "./models";

const playerSearchCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base",
});

function latestAwardActivityDate(player: PlayerSummary): string | undefined {
  const awardDates = player.awardResults?.flatMap(({ date }) =>
    date ? [date] : [],
  );
  if (awardDates?.length) return awardDates.sort().at(-1);

  return player.awardResults
    ?.flatMap(({ lastCheckedAt }) => (lastCheckedAt ? [lastCheckedAt] : []))
    .sort()
    .at(-1);
}

export type PlayerSearchResultOrder = "all" | "awards" | "entries";

function recentActivityDate(
  player: PlayerSummary,
  order: PlayerSearchResultOrder,
): string {
  if (order === "awards" || (order === "all" && player.resultCount > 0))
    return latestAwardActivityDate(player) ?? "";
  return (
    player.latestParticipationDate ??
    player.latestParticipationCheckedAt ??
    ""
  );
}

export function comparePlayerSearchResults(
  left: PlayerSummary,
  right: PlayerSummary,
  order: PlayerSearchResultOrder = "all",
): number {
  const selectedOrder =
    Number(right.identityStatus === "verified") -
    Number(left.identityStatus === "verified");
  if (selectedOrder !== 0) return selectedOrder;

  if (order === "all") {
    const resultTypeOrder =
      Number(right.resultCount > 0) - Number(left.resultCount > 0);
    if (resultTypeOrder !== 0) return resultTypeOrder;
  }

  return (
    recentActivityDate(right, order).localeCompare(
      recentActivityDate(left, order),
    ) ||
    playerSearchCollator.compare(left.region ?? "", right.region ?? "") ||
    playerSearchCollator.compare(left.club ?? "", right.club ?? "") ||
    left.id.localeCompare(right.id)
  );
}

export function sortPlayerSearchResults(
  players: readonly PlayerSummary[],
  order: PlayerSearchResultOrder = "all",
): PlayerSummary[] {
  return [...players].sort((left, right) =>
    comparePlayerSearchResults(left, right, order),
  );
}
