import { stableHash, type NormalizedRecord } from "@busu/domain";
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
import { parseAstreeSearchHtml } from "./parser";

const SEARCH_URL = "https://astree.co.kr/bbs/board.php";

export class AstreeSourceAdapter implements SourceAdapter {
  readonly sourceCode = "astree";
  readonly mode = "http";
  readonly parserVersion = "astree-6";
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
        "애즈트리 live adapter가 비활성화되어 있습니다.",
      );
    const fetchedAt = context.now().toISOString();
    const maxPages = Math.max(1, Math.min(input.maxPages, 2));
    const records: NormalizedRecord[] = [];
    const urls: string[] = [];
    const pageContentHashes: string[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(SEARCH_URL);
      url.searchParams.set("bo_table", "member_search");
      url.searchParams.set("sfl", "wr_subject");
      url.searchParams.set("stx", input.name.trim());
      url.searchParams.set("page", String(page));
      urls.push(url.toString());
      const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
      const signal = input.signal
        ? AbortSignal.any([input.signal, timeoutSignal])
        : timeoutSignal;
      let response: Response;
      try {
        response = await fetch(url, {
          signal,
          headers: {
            accept: "text/html",
            "user-agent": context.userAgent ?? "BUSU",
          },
          redirect: "follow",
        });
      } catch (error) {
        if (signal.aborted) throw new SourceTimeoutError();
        throw new SourceParseError(
          error instanceof Error ? error.message : "애즈트리 요청 실패",
        );
      }
      if (response.status === 403) throw new SourceBlockedError();
      if (response.status === 429) throw new SourceRateLimitedError();
      if (!response.ok)
        throw new SourceParseError(`애즈트리 HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLocaleLowerCase().includes("text/html"))
        throw new SourceSchemaChangedError("HTML이 아닌 응답을 받았습니다.");
      const html = await response.text();
      pageContentHashes.push(stableHash(html));
      const parsed = parseAstreeSearchHtml(html, input.name, fetchedAt);
      records.push(...parsed);
      if (parsed.length === 0 || !html.includes(`page=${page + 1}`)) break;
    }
    const uniqueRecords = [
      ...new Map(
        records.map((record) => [record.naturalKeyHash, record]),
      ).values(),
    ];
    return {
      sourceCode: "astree",
      fetchedAt,
      sourceUrl: urls[0] ?? SEARCH_URL,
      records: uniqueRecords,
      warnings: [],
      rawContentHash: stableHash(pageContentHashes),
      parserVersion: this.parserVersion,
    };
  }
}
