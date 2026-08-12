import { stableHash } from '@busu/domain';
import { SourceBlockedError, SourceDisabledError, SourceParseError, SourceRateLimitedError, SourceSchemaChangedError, SourceTimeoutError, type SourceAdapter, type SourceAdapterContext, type SourceSearchInput, type SourceSearchResult } from '@busu/crawler-core';
import { MYTT_SEARCH_URL, parseMyttSearchForm, parseMyttSearchHtml } from './parser';

function requestSignal(input: SourceSearchInput, context: SourceAdapterContext): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
  return input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
}

function assertResponse(response: Response, label: string): void {
  if (response.status === 403) throw new SourceBlockedError();
  if (response.status === 429) throw new SourceRateLimitedError();
  if (!response.ok) throw new SourceParseError(`마이티티 ${label} HTTP ${response.status}`);
  if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('text/html')) throw new SourceSchemaChangedError('HTML이 아닌 응답을 받았습니다.');
}

export class MyttSourceAdapter implements SourceAdapter {
  readonly sourceCode = 'mytt';
  readonly mode = 'http';
  readonly parserVersion = 'mytt-2';
  constructor(readonly enabled = false) {}
  supportsLiveRefresh(): boolean { return this.enabled; }

  async search(input: SourceSearchInput, context: SourceAdapterContext): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live) throw new SourceDisabledError('마이티티 live adapter가 비활성화되어 있습니다.');
    const signal = requestSignal(input, context);
    const headers = { accept: 'text/html', 'user-agent': context.userAgent ?? 'BUSU/0.1' };
    let pageResponse: Response;
    try {
      pageResponse = await fetch(MYTT_SEARCH_URL, { signal, headers, redirect: 'follow' });
    } catch (error) {
      if (signal.aborted) throw new SourceTimeoutError();
      throw new SourceParseError(error instanceof Error ? error.message : '마이티티 검색 form 요청 실패');
    }
    assertResponse(pageResponse, '검색 form');
    const pageHtml = await pageResponse.text();
    const form = parseMyttSearchForm(pageHtml);
    const cookie = pageResponse.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new SourceSchemaChangedError('마이티티 공개 검색 세션 쿠키를 찾지 못했습니다.');
    const body = new URLSearchParams({
      mainForm: 'mainForm',
      'mainForm:playerName': input.name.trim(),
      'mainForm:clubName': input.club?.trim() ?? '',
      'mainForm:contestName': '',
      'mainForm:scale_input': '',
      [form.submitButton]: form.submitButton,
      'javax.faces.ViewState': form.viewState,
    });
    let response: Response;
    try {
      response = await fetch(MYTT_SEARCH_URL, {
        method: 'POST', signal, redirect: 'follow', body,
        headers: { ...headers, cookie, 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      });
    } catch (error) {
      if (signal.aborted) throw new SourceTimeoutError();
      throw new SourceParseError(error instanceof Error ? error.message : '마이티티 검색 요청 실패');
    }
    assertResponse(response, '검색');
    const html = await response.text();
    const fetchedAt = context.now().toISOString();
    const records = [...new Map(parseMyttSearchHtml(html, input.name, fetchedAt).map((record) => [record.naturalKeyHash, record])).values()];
    return { sourceCode: this.sourceCode, fetchedAt, sourceUrl: MYTT_SEARCH_URL, records, warnings: [], rawContentHash: stableHash(html), parserVersion: this.parserVersion };
  }
}
