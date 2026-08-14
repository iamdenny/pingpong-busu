import type { NormalizedRecord } from "@busu/domain";
import { parseMemberSearchHtml } from "../member-search/parser";

export function parseNewttplaySearchHtml(
  html: string,
  expectedName: string,
  observedAt: string,
): NormalizedRecord[] {
  return parseMemberSearchHtml(html, expectedName, observedAt, {
    sourceCode: "newttplay",
    sourceName: "뉴티티플레이",
    baseUrl: "https://www.newttplay.co.kr/bbs/board.php",
  });
}
