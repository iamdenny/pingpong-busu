export const siteMetadata = {
  name: "BUSU",
  url: "https://modutt.kr/busu/",
  imageUrl: "https://modutt.kr/busu/busu-og.png",
  imageAlt: "BUSU 탁구 선수 부수·입상 기록 통합검색 공유 이미지",
} as const;

export type PageMetadataValue = {
  title: string;
  description: string;
  type: "website" | "profile";
  robots: "index,follow" | "noindex,follow";
};

export function buildCanonicalUrl(pathname: string): string {
  const url = new URL(siteMetadata.url);
  const trimmedPath =
    pathname === "/" ? pathname : pathname.replace(/\/+$/u, "");
  if (/^\/(?:sitemap\.xml|robots\.txt|llms\.txt)$/u.test(trimmedPath)) {
    url.pathname = trimmedPath;
    return url.href;
  }
  const normalizedPath =
    /^\/(?:players\/[^/]+|search|guide|directory(?:\/[^/]+){0,2})$/u.test(
      trimmedPath,
    )
      ? `${trimmedPath}/`
      : trimmedPath;
  const route = (normalizedPath || "/").replace(/^\/+/u, "");
  const base = url.pathname.replace(/\/+$/u, "");
  url.pathname = route ? `${base}/${route}` : `${base}/`;
  return url.href;
}

export function buildPageMetadata(
  pathname: string,
  title: string,
  description: string,
  type: PageMetadataValue["type"] = "website",
  robots?: PageMetadataValue["robots"],
): PageMetadataValue {
  return {
    title,
    description,
    type,
    robots:
      robots ??
      (/^\/search\/?$/u.test(pathname) ? "noindex,follow" : "index,follow"),
  };
}

export function buildPlayerMetadata(player: {
  name: string;
  nickname: string | null | undefined;
  region: string | null;
  club: string | null;
  awardCount: number;
  sourceCount: number;
}): PageMetadataValue {
  const identity = [player.region, player.club].filter(Boolean).join(" · ");
  const nicknameLabel = homonymNicknameLabel(player.nickname ?? undefined);
  const nickname = nicknameLabel ? ` · ${nicknameLabel}` : "";
  const nicknameDescription = nicknameLabel
    ? ` (${nicknameLabel}, 동명이인 기록 구분용 별칭)`
    : "";
  return buildPageMetadata(
    "/players/player",
    `${player.name}${nickname} 선수 탁구 부수·입상 기록 · BUSU`,
    `${player.name} 선수${nicknameDescription}${identity ? ` (${identity})` : ""}의 4강 이상 입상 기록 ${player.awardCount}건과 공개 출처 ${player.sourceCount}곳을 확인하세요.`,
    "profile",
  );
}
import { homonymNicknameLabel } from "@busu/domain";
