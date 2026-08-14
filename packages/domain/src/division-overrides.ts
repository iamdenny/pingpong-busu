import type { DivisionSystem } from "./models";

interface EditionBoundDivisionOverride {
  id: string;
  tournamentNamePattern: RegExp;
  minimumEdition?: number;
  maximumEdition: number;
  divisionSystem: DivisionSystem;
}

export interface RegionalDivisionTransition {
  region: string;
  integratedFrom: string;
  evidenceId: string;
}

export const editionBoundDivisionOverrides: readonly EditionBoundDivisionOverride[] =
  [
    {
      id: "bundang-gu-office-cup-through-18",
      tournamentNamePattern: /분당구\s*청장기/u,
      maximumEdition: 18,
      divisionSystem: "regional",
    },
  ];

const nationalIntegratedFrom = "2022-07-01";

/**
 * 지역별 통합부수 분류 시작일입니다. 명시적인 대회 체계와 대회별 override가
 * 이 표보다 우선하며, 지역과 대회일을 모두 확인한 기록에만 적용합니다.
 */
export const regionalDivisionTransitions: readonly RegionalDivisionTransition[] =
  [
    {
      region: "서울특별시",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "부산광역시",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "대구광역시",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "인천광역시",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "광주광역시",
      integratedFrom: "2017-01-01",
      evidenceId: "gwangju-jeonnam-2017",
    },
    {
      region: "대전광역시",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "울산광역시",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "세종특별자치시",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "경기도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "강원특별자치도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "충청북도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "충청남도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "전북특별자치도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "전라남도",
      integratedFrom: "2017-01-01",
      evidenceId: "gwangju-jeonnam-2017",
    },
    {
      region: "경상북도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "경상남도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
    {
      region: "제주특별자치도",
      integratedFrom: nationalIntegratedFrom,
      evidenceId: "kta-2022",
    },
  ];

export function findTournamentDivisionOverride(
  ...evidence: Array<string | undefined>
): DivisionSystem | undefined {
  const text = evidence
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .normalize("NFKC");
  const editionText = /제\s*(\d+)\s*회/u.exec(text)?.[1];
  if (!editionText) return undefined;
  const edition = Number.parseInt(editionText, 10);

  return editionBoundDivisionOverrides.find(
    ({ tournamentNamePattern, minimumEdition = 1, maximumEdition }) =>
      tournamentNamePattern.test(text) &&
      edition >= minimumEdition &&
      edition <= maximumEdition,
  )?.divisionSystem;
}

export function findRegionalDivisionTransition(
  region: string | undefined,
): RegionalDivisionTransition | undefined {
  if (!region) return undefined;
  const normalized = region.normalize("NFKC").trim();
  return regionalDivisionTransitions.find(
    ({ region: candidate }) =>
      normalized === candidate || normalized.startsWith(`${candidate} `),
  );
}

export function formatPreIntegratedDivisionNotice(
  tournamentDate: string | undefined,
  tournamentRegion: string | undefined,
  divisionSystem: DivisionSystem | undefined,
  tournamentName?: string,
): string | undefined {
  if (
    divisionSystem === "regional" &&
    findTournamentDivisionOverride(tournamentName) === "regional"
  )
    return "분당구청장기 지역부수 운영 기록 · 제18회까지";
  if (
    !isPreIntegratedDivisionRecord({
      date: tournamentDate,
      dateBasis: "tournament",
      tournamentRegion,
      divisionSystem,
      tournament: tournamentName,
    })
  )
    return undefined;
  const transition = findRegionalDivisionTransition(tournamentRegion);
  if (!transition) return undefined;
  const authority =
    transition.evidenceId === "gwangju-jeonnam-2017"
      ? "광주·전남 통합부수"
      : "대한탁구협회 통합부수";
  return `${authority} 시행 이전 · 시행일 ${transition.integratedFrom.replaceAll("-", ".")}`;
}

export function isPreIntegratedDivisionRecord(record: {
  date?: string | undefined;
  dateBasis?: "tournament" | "published" | undefined;
  tournamentRegion?: string | undefined;
  divisionSystem?: DivisionSystem | undefined;
  tournament?: string | undefined;
}): boolean {
  if (record.divisionSystem !== "regional") return false;
  if (findTournamentDivisionOverride(record.tournament) === "regional")
    return true;
  if (
    record.dateBasis !== "tournament" ||
    !record.date ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(record.date)
  )
    return false;
  const transition = findRegionalDivisionTransition(record.tournamentRegion);
  return Boolean(transition && record.date < transition.integratedFrom);
}
