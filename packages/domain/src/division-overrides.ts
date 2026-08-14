import type { DivisionSystem } from './models';

interface EditionBoundDivisionOverride {
  id: string;
  tournamentNamePattern: RegExp;
  minimumEdition?: number;
  maximumEdition: number;
  divisionSystem: DivisionSystem;
}

export const editionBoundDivisionOverrides: readonly EditionBoundDivisionOverride[] = [
  {
    id: 'bundang-gu-office-cup-through-16',
    tournamentNamePattern: /분당구\s*청장기/u,
    maximumEdition: 16,
    divisionSystem: 'regional',
  },
  {
    id: 'bundang-gu-office-cup-18',
    tournamentNamePattern: /분당구\s*청장기/u,
    minimumEdition: 18,
    maximumEdition: 18,
    divisionSystem: 'regional',
  },
];

export function findTournamentDivisionOverride(...evidence: Array<string | undefined>): DivisionSystem | undefined {
  const text = evidence.filter((value): value is string => value !== undefined).join(' ').normalize('NFKC');
  const editionText = /제\s*(\d+)\s*회/u.exec(text)?.[1];
  if (!editionText) return undefined;
  const edition = Number.parseInt(editionText, 10);

  return editionBoundDivisionOverrides.find(
    ({ tournamentNamePattern, minimumEdition = 1, maximumEdition }) =>
      tournamentNamePattern.test(text) && edition >= minimumEdition && edition <= maximumEdition,
  )?.divisionSystem;
}
