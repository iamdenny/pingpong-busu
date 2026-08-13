import { stableHash } from '@busu/domain';
import { SourceBlockedError, SourceDisabledError, SourceParseError, SourceRateLimitedError, SourceSchemaChangedError, SourceTimeoutError, type SourceAdapter, type SourceAdapterContext, type SourceSearchInput, type SourceSearchResult } from '@busu/crawler-core';
import { KAKAO_CAFE_SEARCH_URL, parseYonginCafeSearchResponse } from './parser';

export class YonginTtSourceAdapter implements SourceAdapter {
  readonly sourceCode = 'yongintt';
  readonly mode = 'http';
  readonly parserVersion = 'yongintt-2';

  constructor(readonly enabled = false, private readonly apiKey?: string) {}

  supportsLiveRefresh(): boolean { return this.enabled && Boolean(this.apiKey); }

  async search(input: SourceSearchInput, context: SourceAdapterContext): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live) throw new SourceDisabledError('용인탁구협회 다음 카페 adapter가 비활성화되어 있습니다.');
    if (!this.apiKey) throw new SourceDisabledError('카카오 REST API 키가 설정되지 않았습니다.');
    const fetchedAt = context.now().toISOString();
    const records = [];
    const rawPages: string[] = [];
    const pageLimit = Math.min(Math.max(input.maxPages, 1), 2);
    let sourceUrl = KAKAO_CAFE_SEARCH_URL;

    for (let page = 1; page <= pageLimit; page += 1) {
      const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
      const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
      const url = new URL(KAKAO_CAFE_SEARCH_URL);
      url.searchParams.set('query', `${input.name.trim()} 대회`);
      url.searchParams.set('sort', 'recency');
      url.searchParams.set('page', String(page));
      url.searchParams.set('size', '50');
      sourceUrl = url.toString();
      let response: Response;
      try {
        response = await fetch(url, {
          signal,
          headers: { accept: 'application/json', authorization: `KakaoAK ${this.apiKey}`, 'user-agent': context.userAgent ?? 'BUSU' },
        });
      } catch (error) {
        if (signal.aborted) throw new SourceTimeoutError();
        throw new SourceParseError(error instanceof Error ? error.message : '다음 카페 검색 요청 실패');
      }
      if (response.status === 401 || response.status === 403) throw new SourceBlockedError('카카오 REST API 인증을 확인해 주세요.');
      if (response.status === 429) throw new SourceRateLimitedError('카카오 무료 검색 쿼터 또는 요청 제한에 도달했습니다.');
      if (!response.ok) throw new SourceParseError(`카카오 카페 검색 HTTP ${response.status}`);
      if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('application/json')) throw new SourceSchemaChangedError('JSON이 아닌 응답을 받았습니다.');
      const raw = await response.text();
      rawPages.push(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new SourceSchemaChangedError('카카오 카페 검색 JSON을 해석하지 못했습니다.');
      }
      const result = parseYonginCafeSearchResponse(parsed, input.name, fetchedAt);
      records.push(...result.records);
      if (result.isEnd) break;
    }

    const uniqueRecords = [...new Map(records.map((record) => [record.naturalKeyHash, record])).values()];
    return { sourceCode: this.sourceCode, fetchedAt, sourceUrl, records: uniqueRecords, warnings: [], rawContentHash: stableHash(rawPages), parserVersion: this.parserVersion };
  }
}
