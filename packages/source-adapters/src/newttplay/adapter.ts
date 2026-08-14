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
import { parseNewttplaySearchHtml } from "./parser";

const SEARCH_URL = "https://www.newttplay.co.kr/bbs/board.php";
const MAX_HTML_BYTES = 2 * 1024 * 1024;

async function readBoundedHtml(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    await response.body?.cancel();
    throw new SourceSchemaChangedError(
      "뉴티티플레이 HTML 응답 크기가 제한을 초과했습니다.",
    );
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new SourceSchemaChangedError(
        "뉴티티플레이 HTML 응답 크기가 제한을 초과했습니다.",
      );
    }
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

export class NewttplaySourceAdapter implements SourceAdapter {
  readonly sourceCode = "newttplay";
  readonly mode = "http";
  readonly parserVersion = "newttplay-1";

  constructor(readonly enabled = false) {}

  supportsLiveRefresh(): boolean {
    return this.enabled;
  }

  async search(
    input: SourceSearchInput,
    context: SourceAdapterContext,
  ): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live) {
      throw new SourceDisabledError(
        "뉴티티플레이 live adapter가 비활성화되어 있습니다.",
      );
    }
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
          redirect: "manual",
        });
      } catch (error) {
        if (signal.aborted) throw new SourceTimeoutError();
        throw new SourceParseError(
          error instanceof Error ? error.message : "뉴티티플레이 요청 실패",
        );
      }
      if (response.status >= 300 && response.status < 400) {
        throw new SourceBlockedError(
          "뉴티티플레이가 허용되지 않은 redirect를 반환했습니다.",
        );
      }
      if (response.status === 403) throw new SourceBlockedError();
      if (response.status === 429) throw new SourceRateLimitedError();
      if (!response.ok) {
        throw new SourceParseError(`뉴티티플레이 HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLocaleLowerCase().includes("text/html")) {
        throw new SourceSchemaChangedError("HTML이 아닌 응답을 받았습니다.");
      }
      const html = await readBoundedHtml(response);
      pageContentHashes.push(stableHash(html));
      const parsed = parseNewttplaySearchHtml(html, input.name, fetchedAt);
      records.push(...parsed);
      if (parsed.length === 0 || !html.includes(`page=${page + 1}`)) break;
    }
    const uniqueRecords = [
      ...new Map(
        records.map((record) => [record.naturalKeyHash, record]),
      ).values(),
    ];
    return {
      sourceCode: "newttplay",
      fetchedAt,
      sourceUrl: urls[0] ?? SEARCH_URL,
      records: uniqueRecords,
      warnings: [],
      rawContentHash: stableHash(pageContentHashes),
      parserVersion: this.parserVersion,
    };
  }
}
