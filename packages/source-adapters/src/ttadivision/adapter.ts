import { stableHash, type NormalizedRecord } from '@busu/domain';
import { SourceBlockedError, SourceDisabledError, SourceParseError, SourceRateLimitedError, SourceSchemaChangedError, SourceTimeoutError, type SourceAdapter, type SourceAdapterContext, type SourceSearchInput, type SourceSearchResult } from '@busu/crawler-core';
import { parseTtaDivisionSearchResponse, TTA_DIVISION_SEARCH_URL } from './parser';
import { ttaDivisionSearchResponseSchema } from './schema';

const SEARCH_ENDPOINT = 'https://ttadivision.sports.or.kr/statistic/selectSearchOteamPlyrList.do';

function requestSignal(input: SourceSearchInput, context: SourceAdapterContext): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
  return input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
}

export class TtaDivisionSourceAdapter implements SourceAdapter {
  readonly sourceCode = 'ttadivision';
  readonly mode = 'http';
  readonly parserVersion = 'ttadivision-1';
  constructor(readonly enabled = false) {}
  supportsLiveRefresh(): boolean { return this.enabled; }

  async search(input: SourceSearchInput, context: SourceAdapterContext): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live) throw new SourceDisabledError('대한탁구협회 디비전 live adapter가 비활성화되어 있습니다.');
    const signal = requestSignal(input, context);
    const headers = { accept: 'text/html', 'user-agent': context.userAgent ?? 'BUSU/0.1' };
    let pageResponse: Response;
    try {
      pageResponse = await fetch(TTA_DIVISION_SEARCH_URL, { signal, headers, redirect: 'follow' });
    } catch (error) {
      if (signal.aborted) throw new SourceTimeoutError();
      throw new SourceParseError(error instanceof Error ? error.message : '대한탁구협회 디비전 요청 실패');
    }
    if (pageResponse.status === 403) throw new SourceBlockedError();
    if (pageResponse.status === 429) throw new SourceRateLimitedError();
    if (!pageResponse.ok) throw new SourceParseError(`대한탁구협회 디비전 HTTP ${pageResponse.status}`);
    const html = await pageResponse.text();
    const csrfToken = /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/iu.exec(html)?.[1];
    const cookie = pageResponse.headers.get('set-cookie')?.split(';', 1)[0];
    if (!csrfToken || !cookie || !html.includes('searchOteamPlayer.js')) throw new SourceSchemaChangedError('대한탁구협회 디비전 공개 검색 식별자를 찾지 못했습니다.');

    const fetchedAt = context.now().toISOString();
    const pageCount = Math.max(1, Math.min(input.maxPages, 2));
    const records: NormalizedRecord[] = [];
    const responseHashes: string[] = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const body = new URLSearchParams({ sigunguCd: 'ALL', selectSize: '100', nameSolt: '1', searchScrGbn: 'PP', ttStart: '0', ttEnd: '9999', searchValue: input.name.trim(), memberNm: input.name.trim(), pageIndex: String(page) });
      const response = await fetch(SEARCH_ENDPOINT, {
        method: 'POST', signal, redirect: 'follow', body,
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded; charset=utf-8', cookie, 'x-csrf-token': csrfToken, 'user-agent': context.userAgent ?? 'BUSU/0.1' },
      });
      if (response.status === 403) throw new SourceBlockedError();
      if (response.status === 429) throw new SourceRateLimitedError();
      if (!response.ok) throw new SourceParseError(`대한탁구협회 디비전 검색 HTTP ${response.status}`);
      const value: unknown = await response.json();
      responseHashes.push(stableHash(JSON.stringify(value)));
      const validated = ttaDivisionSearchResponseSchema.parse(value);
      const parsed = parseTtaDivisionSearchResponse(validated, input.name, fetchedAt);
      records.push(...parsed);
      if (page >= validated.paging.totalPage) break;
    }
    const uniqueRecords = [...new Map(records.map((record) => [record.naturalKeyHash, record])).values()];
    return { sourceCode: this.sourceCode, fetchedAt, sourceUrl: TTA_DIVISION_SEARCH_URL, records: uniqueRecords, warnings: [], rawContentHash: stableHash(responseHashes), parserVersion: this.parserVersion };
  }
}
