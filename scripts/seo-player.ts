import { formatDivisionObservation, homonymNicknameLabel } from "@busu/domain";
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
import { GUIDE_PATH } from "./seo-guide";
import type { SeoAward, SeoPlayer } from "./seo-manifest";

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

export function recentDivisionLabel(player: SeoPlayer): string | null {
  if (!player.recent_observed_division) return null;
  return formatDivisionObservation(
    player.recent_observed_division_system ?? undefined,
    player.recent_observed_division,
  );
}

export function koreanDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}년 ${parsed.getUTCMonth() + 1}월 ${parsed.getUTCDate()}일`;
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function awardSentence(award: SeoAward): string {
  const division = award.division
    ? formatDivisionObservation(
        award.division_system ?? undefined,
        award.division,
      )
    : null;
  return [
    koreanDate(award.date),
    award.tournament,
    award.event,
    division,
    award.rank,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

// One quotable sentence carries the whole answer for a reader — human or
// machine — that never gets past the first paragraph.
export function playerSummarySentence(player: SeoPlayer): string {
  const name = playerDisplayName(player);
  const division = recentDivisionLabel(player);
  const checked = koreanDate(player.last_checked_at);
  const observed = division
    ? `${name} 선수의 최근 관측 부수는 ${division}입니다.`
    : `${name} 선수는 공개 기록에서 최근 관측 부수가 확인되지 않았습니다.`;
  const counts = `BUSU는 공개 대회 기록에서 4강 이상 입상 ${player.result_count.toLocaleString("ko-KR")}건을 공개 출처 ${player.source_count.toLocaleString("ko-KR")}곳에서 확인했습니다.`;
  const identity = [player.primary_region, player.primary_club].filter(Boolean);
  const where =
    identity.length > 0
      ? ` 확인된 지역·소속은 ${identity.join(", ")}입니다.`
      : "";
  const when = checked ? ` 마지막 확인은 ${checked}입니다.` : "";
  return `${observed} ${counts}${where}${when}`;
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

function renderAwardRows(awards: readonly SeoAward[]): string {
  return awards
    .map((award) => {
      const held = isoDate(award.date);
      const date = held
        ? `<time datetime="${held}">${escapeHtml(koreanDate(award.date) ?? held)}</time>`
        : "확인 필요";
      const division = award.division
        ? escapeHtml(
            formatDivisionObservation(
              award.division_system ?? undefined,
              award.division,
            ),
          )
        : "-";
      return `<tr>
            <td>${date}</td>
            <td>${escapeHtml(award.tournament ?? "확인 필요")}</td>
            <td>${escapeHtml(award.event ?? "-")}</td>
            <td>${division}</td>
            <td>${escapeHtml(award.rank)}</td>
          </tr>`;
    })
    .join("\n");
}

function renderAwardSection(player: SeoPlayer): string {
  const awards = player.recent_awards ?? [];
  if (awards.length === 0)
    return `<section class="seo-player-section">
        <h2>최근 입상 기록</h2>
        <p>공개 출처에서 확인한 4강 이상 입상 기록이 아직 없습니다. 8강 이하 성적은 참가 이력으로만 보존합니다.</p>
      </section>`;
  return `<section class="seo-player-section">
        <h2>최근 입상 기록</h2>
        <div class="seo-player-scroll">
        <table class="seo-player-awards">
          <caption>공개 출처에서 확인한 최근 4강 이상 입상 ${awards.length.toLocaleString("ko-KR")}건</caption>
          <thead>
            <tr><th scope="col">대회일</th><th scope="col">대회</th><th scope="col">종목</th><th scope="col">관측 부수</th><th scope="col">성적</th></tr>
          </thead>
          <tbody>
${renderAwardRows(awards)}
          </tbody>
        </table>
        </div>
      </section>`;
}

function renderSourceSection(player: SeoPlayer): string {
  const sources = player.source_names ?? [];
  if (sources.length === 0) return "";
  return `<section class="seo-player-section">
        <h2>확인한 공개 출처</h2>
        <ul class="seo-player-sources">
${sources.map((source) => `          <li>${escapeHtml(source)}</li>`).join("\n")}
        </ul>
      </section>`;
}

// The SPA renders the full record view after mount; this static summary exists
// so the raw HTML carries the player's records for crawlers that do not run JS.
export function renderPlayerBody(player: SeoPlayer, basePath: string): string {
  const slug = groupSlugForName(player.canonical_name);
  const label = groupLabelForSlug(slug);
  const name = escapeHtml(playerDisplayName(player));
  const division = recentDivisionLabel(player);
  const checkedIso = isoDate(player.last_checked_at);
  const checkedLabel = koreanDate(player.last_checked_at);
  return `<article class="seo-player">
      <nav class="seo-player-breadcrumb" aria-label="상위 목록">
        <a href="${escapeHtml(href(basePath, ""))}">BUSU 홈</a>
        <a href="${escapeHtml(href(basePath, directoryPath()))}">탁구 선수 전체 목록</a>
        <a href="${escapeHtml(href(basePath, directoryPath(slug)))}">${escapeHtml(label)} 시작 선수</a>
      </nav>
      <h1>${name} 선수 탁구 부수·입상 기록</h1>
      <p class="seo-player-identity">${escapeHtml(identityText(player))}</p>
      <p class="seo-player-summary">${escapeHtml(playerSummarySentence(player))}</p>
      <dl class="seo-player-counts">
        <dt>최근 관측 부수</dt>
        <dd>${escapeHtml(division ?? "확인 필요")}</dd>
        <dt>4강 이상 입상</dt>
        <dd>${player.result_count.toLocaleString("ko-KR")}건</dd>
        <dt>공개 출처</dt>
        <dd>${player.source_count.toLocaleString("ko-KR")}곳</dd>
${
  checkedIso && checkedLabel
    ? `        <dt>최종 확인</dt>
        <dd><time datetime="${checkedIso}">${escapeHtml(checkedLabel)}</time></dd>`
    : ""
}
      </dl>
      ${renderAwardSection(player)}
      ${renderSourceSection(player)}
      <p>BUSU는 부수를 판정하지 않고 공개된 근거만 모아 보여줍니다. 관측 부수는 공개 대회 기록에서 확인한 값이며 공식 등급이 아닙니다. 입상은 우승·준우승·1~3위·2강·4강까지만 집계하고 8강 이하는 참가 이력으로 둡니다.</p>
      <p class="seo-player-links">
        <a href="${escapeHtml(href(basePath, directoryPath(slug)))}">${escapeHtml(label)}으로 시작하는 다른 선수 보기</a>
        <a href="${escapeHtml(href(basePath, GUIDE_PATH))}">탁구 부수 안내</a>
      </p>
    </article>`;
}

function awardItemList(
  player: SeoPlayer,
  canonical: string,
): readonly unknown[] {
  const awards = player.recent_awards ?? [];
  if (awards.length === 0) return [];
  return [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${canonical}#awards`,
      name: `${playerDisplayName(player)} 선수 최근 입상 기록`,
      numberOfItems: awards.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: awards.map((award, index) => {
        const event: Record<string, unknown> = {
          "@type": "SportsEvent",
          name: award.tournament ?? "확인 필요",
          sport: "Table tennis",
        };
        const held = isoDate(award.date);
        if (held) event.startDate = held;
        return {
          "@type": "ListItem",
          position: index + 1,
          name: awardSentence(award),
          item: event,
        };
      }),
    },
  ];
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
  const awards = player.recent_awards ?? [];
  if (awards.length > 0) person.award = awards.map(awardSentence);
  const profile: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${canonical}#profile`,
    url: canonical,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${siteMetadata.url}#website` },
    description: playerSummarySentence(player),
    mainEntity: person,
  };
  const modified = player.last_checked_at;
  if (modified) profile.dateModified = modified;
  return [
    profile,
    breadcrumbJsonLd(playerBreadcrumb(player)),
    ...awardItemList(player, canonical),
  ];
}
