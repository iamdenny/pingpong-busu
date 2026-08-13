import { stableHash } from '@busu/domain';
import { SourceBlockedError, SourceDisabledError, SourceParseError, SourceRateLimitedError, SourceSchemaChangedError, SourceTimeoutError, type SourceAdapter, type SourceAdapterContext, type SourceSearchInput, type SourceSearchResult } from '@busu/crawler-core';
import { parseSuperstarSearchHtml, SUPERSTAR_SEARCH_URL } from './parser';

export class SuperstarSourceAdapter implements SourceAdapter {
  readonly sourceCode = 'superstar';
  readonly mode = 'http';
  readonly parserVersion = 'superstar-1';
  constructor(readonly enabled = false) {}
  supportsLiveRefresh(): boolean { return this.enabled; }

  async search(input: SourceSearchInput, context: SourceAdapterContext): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live) throw new SourceDisabledError('슈퍼스타탁구 live adapter가 비활성화되어 있습니다.');
    const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    const url = new URL(SUPERSTAR_SEARCH_URL);
    url.searchParams.set('userNm', input.name.trim());
    let response: Response;
    try {
      response = await fetch(url, { signal, redirect: 'follow', headers: { accept: 'text/html', 'user-agent': context.userAgent ?? 'BUSU' } });
    } catch (error) {
      if (signal.aborted) throw new SourceTimeoutError();
      throw new SourceParseError(error instanceof Error ? error.message : '슈퍼스타탁구 검색 요청 실패');
    }
    if (response.status === 403) throw new SourceBlockedError();
    if (response.status === 429) throw new SourceRateLimitedError();
    if (!response.ok) throw new SourceParseError(`슈퍼스타탁구 HTTP ${response.status}`);
    if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('text/html')) throw new SourceSchemaChangedError('HTML이 아닌 응답을 받았습니다.');
    const html = await response.text();
    const fetchedAt = context.now().toISOString();
    const records = [...new Map(parseSuperstarSearchHtml(html, input.name, fetchedAt).map((record) => [record.naturalKeyHash, record])).values()];
    return { sourceCode: this.sourceCode, fetchedAt, sourceUrl: url.toString(), records, warnings: [], rawContentHash: stableHash(html), parserVersion: this.parserVersion };
  }
}
