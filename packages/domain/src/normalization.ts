export interface ParsedPlayerName {
  original: string;
  name: string;
  normalizedName: string;
  divisionCandidate?: string;
}

export interface ParsedPlayerSearchQuery {
  name: string;
  region?: string;
}

const collapseWhitespace = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');

export const normalizeSearchText = (value: string): string =>
  collapseWhitespace(value).replace(/\s/gu, '').toLocaleLowerCase('ko-KR');

export const normalizePlayerName = normalizeSearchText;
export const normalizeClubName = normalizeSearchText;

export function parsePlayerSearchQuery(value: string): ParsedPlayerSearchQuery {
  const [name = '', ...regionParts] = collapseWhitespace(value).split(' ');
  const region = regionParts.join(' ').trim();
  return { name, ...(region ? { region } : {}) };
}

export function parsePlayerName(value: string): ParsedPlayerName {
  const original = collapseWhitespace(value);
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/u.exec(original);
  const name = collapseWhitespace(match?.[1] ?? original);
  const candidate = match?.[2] ? collapseWhitespace(match[2]) : undefined;
  return {
    original,
    name,
    normalizedName: normalizePlayerName(name),
    ...(candidate !== undefined && /(?:부|선수부|초심부|희망부)$/u.test(candidate)
      ? { divisionCandidate: candidate }
      : {}),
  };
}

export const normalizeComparableText = (value?: string): string | undefined =>
  value === undefined ? undefined : collapseWhitespace(value).toLocaleLowerCase('ko-KR');
