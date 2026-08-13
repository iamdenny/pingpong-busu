import {
  displayDivisionValue,
  divisionSystemLabels,
  type DivisionObservationSummary,
  type DivisionSystem,
  type PlayerSummary,
} from "@busu/domain";

export interface DivisionSummaryItem {
  system: DivisionSystem;
  systemLabel: string;
  division: string;
  awardCount: number;
  participationCount: number;
}

const systemOrder: DivisionSystem[] = [
  "open",
  "integrated",
  "women",
  "regional",
  "division",
  "unknown",
];

export function summarizeObservedDivisions(
  players: readonly PlayerSummary[],
): DivisionSummaryItem[] {
  const counts = new Map<
    string,
    Pick<DivisionSummaryItem, "awardCount" | "participationCount">
  >();
  for (const player of players) {
    for (const observation of observationsForPlayer(player)) {
      const key = `${observation.system}\u0000${observation.division}`;
      const current = counts.get(key) ?? {
        awardCount: 0,
        participationCount: 0,
      };
      counts.set(key, {
        awardCount: current.awardCount + observation.awardCount,
        participationCount:
          current.participationCount + observation.participationCount,
      });
    }
  }

  return [...counts.entries()]
    .map(([key, count]) => {
      const [systemValue, division = "확인 필요"] = key.split("\u0000");
      const system = systemValue as DivisionSystem;
      return {
        system,
        systemLabel: divisionSystemLabels[system],
        division: displayDivisionValue(system, division),
        ...count,
      };
    })
    .sort(
      (left, right) =>
        systemOrder.indexOf(left.system) - systemOrder.indexOf(right.system) ||
        right.awardCount +
          right.participationCount -
          (left.awardCount + left.participationCount) ||
        left.division.localeCompare(right.division, "ko-KR", { numeric: true }),
    );
}

function observationsForPlayer(
  player: PlayerSummary,
): DivisionObservationSummary[] {
  if (player.divisionObservations !== undefined) {
    return player.divisionObservations;
  }
  return [
    {
      system: player.recentObservedDivisionSystem ?? "unknown",
      division: player.recentObservedDivision ?? "확인 필요",
      awardCount: player.resultCount,
      participationCount: player.resultCount === 0 ? 1 : 0,
    },
  ];
}

export function divisionObservationForPlayer(
  player: PlayerSummary,
  summary: Pick<DivisionSummaryItem, "system" | "division">,
) {
  return observationsForPlayer(player).find(
    (observation) =>
      observation.system === summary.system &&
      displayDivisionValue(observation.system, observation.division) ===
        summary.division,
  );
}

export function matchesObservedDivision(
  player: PlayerSummary,
  summary: Pick<DivisionSummaryItem, "system" | "division">,
): boolean {
  return divisionObservationForPlayer(player, summary) !== undefined;
}
