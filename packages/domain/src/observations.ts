export function isAwardRank(rankText?: string): boolean {
  if (rankText === undefined) return false;
  const normalized = rankText.normalize('NFKC').replace(/\s+/gu, '');
  return normalized.includes('우승')
    || /(?:^|[^0-9])[123]위(?:$|[^0-9])/u.test(normalized)
    || /(?:^|[^0-9])(?:2|4)강(?:$|[^0-9])/u.test(normalized);
}
