import {
  displayDivisionValue,
  divisionSystemLabels,
  homonymNicknameLabel,
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

export interface DivisionSummaryGroup {
  system: Exclude<DivisionSystem, "women">;
  systemLabel: string;
  items: DivisionSummaryItem[];
}

export interface IdentityDivisionSummarySection {
  key: string;
  label: string;
  isAssigned: boolean;
  players: PlayerSummary[];
  summaries: DivisionSummaryItem[];
  groups: DivisionSummaryGroup[];
}

export const allIdentityDivisionSummaryKey = "all";
export const unassignedIdentityDivisionSummaryKey = "unassigned";

const systemOrder: DivisionSystem[] = [
  "open",
  "integrated",
  "women",
  "regional",
  "division",
  "unknown",
];
const divisionCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base",
});

function divisionOrder(value: string): [category: number, level: number] {
  const normalized = value.normalize("NFKC").replaceAll(" ", "");

  if (/^(?:남자|여자|여성)?선수부$/u.test(normalized)) return [0, -1];

  const numberedDivision = normalized.match(/(\d+)부/u);
  if (numberedDivision?.[1]) return [1, Number(numberedDivision[1])];

  const divisionLeague = normalized.match(/^T(\d+)$/iu);
  if (divisionLeague?.[1]) return [1, Number(divisionLeague[1])];

  return [2, Number.POSITIVE_INFINITY];
}

function compareDivisions(left: string, right: string): number {
  const [leftCategory, leftLevel] = divisionOrder(left);
  const [rightCategory, rightLevel] = divisionOrder(right);

  return (
    leftCategory - rightCategory ||
    leftLevel - rightLevel ||
    divisionCollator.compare(left, right)
  );
}

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
        compareDivisions(left.division, right.division),
    );
}

export function summarizeObservedDivisionsByIdentity(
  players: readonly PlayerSummary[],
): IdentityDivisionSummarySection[] {
  const allRecordsSection = (): IdentityDivisionSummarySection => {
    const summaries = summarizeObservedDivisions(players);
    return {
      key: allIdentityDivisionSummaryKey,
      label: "전체 기록",
      isAssigned: false,
      players: [...players],
      summaries,
      groups: groupDivisionSummaries(summaries),
    };
  };

  if (players.length < 2) return [allRecordsSection()];

  const assigned = new Map<
    string,
    Pick<IdentityDivisionSummarySection, "key" | "label" | "isAssigned"> & {
      players: PlayerSummary[];
    }
  >();
  const unassigned: PlayerSummary[] = [];

  for (const player of players) {
    const nickname =
      player.identityStatus === "verified"
        ? homonymNicknameLabel(player.homonymNickname)?.trim()
        : undefined;
    if (!nickname) {
      unassigned.push(player);
      continue;
    }

    const key = `nickname:${nickname.normalize("NFKC")}`;
    const current = assigned.get(key);
    if (current) {
      current.players.push(player);
      continue;
    }
    assigned.set(key, {
      key,
      label: nickname,
      isAssigned: true,
      players: [player],
    });
  }

  if (assigned.size === 0) {
    return [allRecordsSection()];
  }

  const sections = [...assigned.values()]
    .sort((left, right) => divisionCollator.compare(left.label, right.label))
    .map((section): IdentityDivisionSummarySection => {
      const summaries = summarizeObservedDivisions(section.players);
      return {
        ...section,
        summaries,
        groups: groupDivisionSummaries(summaries),
      };
    });

  if (unassigned.length > 0) {
    const summaries = summarizeObservedDivisions(unassigned);
    sections.push({
      key: unassignedIdentityDivisionSummaryKey,
      label: "미분류 기록",
      isAssigned: false,
      players: unassigned,
      summaries,
      groups: groupDivisionSummaries(summaries),
    });
  }

  return sections;
}

export function groupDivisionSummaries(
  summaries: readonly DivisionSummaryItem[],
): DivisionSummaryGroup[] {
  const groups = new Map<
    DivisionSummaryGroup["system"],
    DivisionSummaryGroup
  >();

  for (const summary of summaries) {
    const system = summary.system === "women" ? "integrated" : summary.system;
    const current = groups.get(system);

    if (current) {
      current.items.push(summary);
      continue;
    }

    groups.set(system, {
      system,
      systemLabel: divisionSystemLabels[system],
      items: [summary],
    });
  }

  for (const group of groups.values()) {
    group.items.sort((left, right) =>
      compareDivisions(left.division, right.division),
    );
  }

  return [...groups.values()];
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
