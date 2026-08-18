import { homonymNicknameLabel } from "@busu/domain";
import {
  buildCanonicalUrl,
  siteMetadata,
} from "../apps/web/src/lib/pageMetadata";
import { breadcrumbJsonLd, escapeHtml, type BreadcrumbItem } from "./seo-html";
import {
  directoryPath,
  groupLabelForSlug,
  groupSlugForName,
} from "./seo-directory";
import type { SeoPlayer } from "./generate-seo-pages";

function href(basePath: string, path: string): string {
  return `${basePath.replace(/\/+$/u, "")}${path}/`;
}

export function playerDisplayName(player: SeoPlayer): string {
  const label = homonymNicknameLabel(player.homonym_nickname ?? undefined);
  return label ? `${player.canonical_name} · ${label}` : player.canonical_name;
}

function identityText(player: SeoPlayer): string {
  return (
    [player.primary_region, player.primary_club]
      .filter((value): value is string => Boolean(value))
      .join(" · ") || "공개된 지역·소속 정보 없음"
  );
}

export function playerBreadcrumb(player: SeoPlayer): BreadcrumbItem[] {
  const slug = groupSlugForName(player.canonical_name);
  return [
    { name: "BUSU 홈", url: buildCanonicalUrl("/") },
    { name: "탁구 선수 전체 목록", url: buildCanonicalUrl(directoryPath()) },
    {
      name: `${groupLabelForSlug(slug)} 시작 선수`,
      url: buildCanonicalUrl(directoryPath(slug)),
    },
    {
      name: playerDisplayName(player),
      url: buildCanonicalUrl(`/players/${player.id}`),
    },
  ];
}

// The SPA renders the full record view after mount; this static summary exists
// so the raw HTML carries the player's identity for crawlers that do not run JS.
export function renderPlayerBody(player: SeoPlayer, basePath: string): string {
  const slug = groupSlugForName(player.canonical_name);
  const label = groupLabelForSlug(slug);
  const name = escapeHtml(playerDisplayName(player));
  return `<article class="seo-player">
      <nav class="seo-player-breadcrumb" aria-label="상위 목록">
        <a href="${escapeHtml(href(basePath, ""))}">BUSU 홈</a>
        <a href="${escapeHtml(href(basePath, directoryPath()))}">탁구 선수 전체 목록</a>
        <a href="${escapeHtml(href(basePath, directoryPath(slug)))}">${escapeHtml(label)} 시작 선수</a>
      </nav>
      <h1>${name} 선수 탁구 부수·입상 기록</h1>
      <p class="seo-player-identity">${escapeHtml(identityText(player))}</p>
      <dl class="seo-player-counts">
        <dt>4강 이상 입상</dt>
        <dd>${player.result_count.toLocaleString("ko-KR")}건</dd>
        <dt>공개 출처</dt>
        <dd>${player.source_count.toLocaleString("ko-KR")}곳</dd>
      </dl>
      <p>${name} 선수의 공개 대회 관측 부수와 출전·입상 기록을 원문 출처와 함께 확인할 수 있습니다. BUSU는 부수를 판정하지 않고 공개된 근거만 모아 보여줍니다.</p>
      <p><a href="${escapeHtml(href(basePath, directoryPath(slug)))}">${escapeHtml(label)}으로 시작하는 다른 선수 보기</a></p>
    </article>`;
}

export function playerJsonLd(player: SeoPlayer): unknown[] {
  const canonical = buildCanonicalUrl(`/players/${player.id}`);
  const person: Record<string, unknown> = {
    "@type": "Person",
    "@id": `${canonical}#person`,
    name: playerDisplayName(player),
  };
  const affiliation = player.primary_club;
  if (affiliation)
    person.affiliation = { "@type": "Organization", name: affiliation };
  if (player.primary_region) person.homeLocation = player.primary_region;
  return [
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "@id": `${canonical}#profile`,
      url: canonical,
      inLanguage: "ko-KR",
      isPartOf: { "@id": `${siteMetadata.url}#website` },
      mainEntity: person,
    },
    breadcrumbJsonLd(playerBreadcrumb(player)),
  ];
}
