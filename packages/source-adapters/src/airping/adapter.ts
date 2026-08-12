import { stableHash } from '@busu/domain';
import { SourceBlockedError, SourceDisabledError, SourceParseError, SourceRateLimitedError, SourceSchemaChangedError, SourceTimeoutError, type SourceAdapter, type SourceAdapterContext, type SourceSearchInput, type SourceSearchResult } from '@busu/crawler-core';
import { AIRPING_SEARCH_URL, parseAirpingSearchHtml } from './parser';

export class AirpingSourceAdapter implements SourceAdapter {
  readonly sourceCode = 'airping';
  readonly mode = 'http';
  readonly parserVersion = 'airping-2';
  constructor(readonly enabled = false) {}
  supportsLiveRefresh(): boolean { return this.enabled; }

  async search(input: SourceSearchInput, context: SourceAdapterContext): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live) throw new SourceDisabledError('에어핑퐁은 출처 운영자의 사전 승낙 전까지 비활성화됩니다.');
    const url = new URL(AIRPING_SEARCH_URL);
    url.searchParams.set('key', 'r_name');
    url.searchParams.set('keyword', input.name.trim());
    const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await fetch(url, { signal, headers: { accept: 'text/html', 'user-agent': context.userAgent ?? 'BUSU/0.1' }, redirect: 'follow' });
    } catch (error) {
      if (signal.aborted) throw new SourceTimeoutError();
      throw new SourceParseError(error instanceof Error ? error.message : '에어핑퐁 요청 실패');
    }
    if (response.status === 403) throw new SourceBlockedError();
    if (response.status === 429) throw new SourceRateLimitedError();
    if (!response.ok) throw new SourceParseError(`에어핑퐁 HTTP ${response.status}`);
    if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('text/html')) throw new SourceSchemaChangedError('HTML이 아닌 응답을 받았습니다.');
    const html = await response.text();
    const fetchedAt = context.now().toISOString();
    const records = [...new Map(parseAirpingSearchHtml(html, input.name, fetchedAt).map((record) => [record.naturalKeyHash, record])).values()];
    return { sourceCode: this.sourceCode, fetchedAt, sourceUrl: url.toString(), records, warnings: ['출처 운영자의 데이터 재사용 승낙이 필요합니다.'], rawContentHash: stableHash(html), parserVersion: this.parserVersion };
  }
}
