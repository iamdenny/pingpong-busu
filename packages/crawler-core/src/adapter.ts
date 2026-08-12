import type { NormalizedRecord, SourceCode } from '@busu/domain';

export interface SourceSearchInput {
  name: string;
  normalizedName: string;
  club?: string;
  region?: string;
  maxPages: number;
  signal?: AbortSignal;
  live: boolean;
}
export interface SourceAdapterContext { now: () => Date; timeoutMs: number; userAgent?: string; }
export interface SourceSearchResult {
  sourceCode: SourceCode;
  fetchedAt: string;
  sourceUrl: string;
  records: NormalizedRecord[];
  warnings: string[];
  rawContentHash?: string;
  parserVersion: string;
}
export interface SourceAdapter {
  readonly sourceCode: SourceCode;
  readonly mode: 'http' | 'browser' | 'manual';
  readonly parserVersion: string;
  readonly enabled: boolean;
  supportsLiveRefresh(): boolean;
  search(input: SourceSearchInput, context: SourceAdapterContext): Promise<SourceSearchResult>;
}
