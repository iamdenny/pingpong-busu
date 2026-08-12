export function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

export function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/giu, ' ').replace(/<[^>]+>/gu, ' '))
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function extractTableCells(rowHtml: string): string[] {
  const withoutComments = rowHtml.replace(/<!--[\s\S]*?-->/gu, '');
  return [...withoutComments.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/giu)].map((match) => match[1] ?? '');
}

export function firstIsoDate(value: string): string | undefined {
  const match = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/u.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

export function eventTypeFromText(value: string): 'singles' | 'doubles' | 'team' | 'unknown' {
  if (/단식/u.test(value)) return 'singles';
  if (/복식/u.test(value)) return 'doubles';
  if (/단체/u.test(value)) return 'team';
  return 'unknown';
}

export function normalizeObservedDivision(value?: string): string | undefined {
  const normalized = value?.normalize('NFKC').replace(/\s+/gu, '').trim();
  if (!normalized || normalized === '-') return undefined;
  if (/^(?:T[1-7]|.*부)$/iu.test(normalized)) return normalized.toUpperCase();
  if (/^(?:\d+|ACE|A|B|C|희망|초심)$/iu.test(normalized)) return `${normalized.toUpperCase()}부`;
  return normalized;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
