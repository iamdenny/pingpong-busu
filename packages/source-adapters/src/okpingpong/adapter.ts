import { stableHash } from "@busu/domain";
import {
  SourceBlockedError,
  SourceDisabledError,
  SourceParseError,
  SourceRateLimitedError,
  SourceSchemaChangedError,
  SourceTimeoutError,
  type SourceAdapter,
  type SourceAdapterContext,
  type SourceSearchInput,
  type SourceSearchResult,
} from "@busu/crawler-core";
import { OKPINGPONG_SEARCH_URL, parseOkPingpongSearchHtml } from "./parser";
import { fetchWithRetry } from "../resilient-fetch";

export class OkPingpongSourceAdapter implements SourceAdapter {
  readonly sourceCode = "okpingpong";
  readonly mode = "http";
  readonly parserVersion = "okpingpong-3";
  constructor(readonly enabled = false) {}
  supportsLiveRefresh(): boolean {
    return this.enabled;
  }

  async search(
    input: SourceSearchInput,
    context: SourceAdapterContext,
  ): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live)
      throw new SourceDisabledError(
        "오케이핑퐁은 출처 운영자의 사전 승낙 전까지 비활성화됩니다.",
      );
    const url = new URL(OKPINGPONG_SEARCH_URL);
    url.searchParams.set("key", "name");
    url.searchParams.set("keyword", input.name.trim());
    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        {
          ...(input.signal ? { signal: input.signal } : {}),
          headers: {
            accept: "text/html",
            "user-agent": context.userAgent ?? "BUSU",
          },
          redirect: "follow",
        },
        {
          timeoutMs: Math.max(context.timeoutMs, 10_000),
          maxAttempts: 2,
          retryDelayMs: 250,
        },
      );
    } catch (error) {
      if (
        input.signal?.aborted ||
        (error instanceof DOMException &&
          ["AbortError", "TimeoutError"].includes(error.name))
      )
        throw new SourceTimeoutError();
      throw new SourceParseError(
        error instanceof Error ? error.message : "오케이핑퐁 요청 실패",
      );
    }
    if (response.status === 403) throw new SourceBlockedError();
    if (response.status === 429) throw new SourceRateLimitedError();
    if (!response.ok)
      throw new SourceParseError(`오케이핑퐁 HTTP ${response.status}`);
    if (
      !(response.headers.get("content-type") ?? "")
        .toLocaleLowerCase()
        .includes("text/html")
    )
      throw new SourceSchemaChangedError("HTML이 아닌 응답을 받았습니다.");
    const html = await response.text();
    const fetchedAt = context.now().toISOString();
    const records = [
      ...new Map(
        parseOkPingpongSearchHtml(html, input.name, fetchedAt).map((record) => [
          record.naturalKeyHash,
          record,
        ]),
      ).values(),
    ];
    return {
      sourceCode: this.sourceCode,
      fetchedAt,
      sourceUrl: url.toString(),
      records,
      warnings: ["출처 운영자의 데이터 재사용 승낙이 필요합니다."],
      rawContentHash: stableHash(html),
      parserVersion: this.parserVersion,
    };
  }
}
