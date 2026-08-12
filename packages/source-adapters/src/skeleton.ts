import type { SourceCode } from '@busu/domain';
import { SourceDisabledError, SourceUnsupportedError, type SourceAdapter, type SourceSearchInput, type SourceSearchResult } from '@busu/crawler-core';

export class DisabledSourceAdapter implements SourceAdapter {
  readonly enabled = false;
  constructor(public readonly sourceCode: Exclude<SourceCode, 'mock'>, public readonly mode: 'http' | 'browser' | 'manual', public readonly parserVersion = 'skeleton-0') {}
  supportsLiveRefresh(): boolean { return false; }
  async search(input: SourceSearchInput): Promise<SourceSearchResult> {
    void input;
    if (this.mode === 'manual') throw new SourceUnsupportedError('수동 원문 확인만 지원합니다.');
    throw new SourceDisabledError(`${this.sourceCode} adapter는 정책 및 파서 확인 전까지 비활성화되어 있습니다.`);
  }
}
