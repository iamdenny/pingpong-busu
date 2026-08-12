// Edge-compatible generated surface. Keep behavior synchronized with packages/domain normalization tests.
export const normalizeName = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu,'').toLocaleLowerCase('ko-KR');
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
