import { escapeHtml } from "./seo-html";
import type { SeoPlayer } from "./generate-seo-pages";

export const DIRECTORY_PAGE_SIZE = 200;

type GroupDefinition = {
  slug: string;
  label: string;
  initials: readonly string[];
};

// Slugs stay ASCII so the generated paths survive filesystem and transport
// normalization; the Korean label is the user-facing name.
const GROUP_DEFINITIONS: readonly GroupDefinition[] = [
  { slug: "g", label: "ㄱ", initials: ["ㄱ", "ㄲ"] },
  { slug: "n", label: "ㄴ", initials: ["ㄴ"] },
  { slug: "d", label: "ㄷ", initials: ["ㄷ", "ㄸ"] },
  { slug: "r", label: "ㄹ", initials: ["ㄹ"] },
  { slug: "m", label: "ㅁ", initials: ["ㅁ"] },
  { slug: "b", label: "ㅂ", initials: ["ㅂ", "ㅃ"] },
  { slug: "s", label: "ㅅ", initials: ["ㅅ", "ㅆ"] },
  { slug: "o", label: "ㅇ", initials: ["ㅇ"] },
  { slug: "j", label: "ㅈ", initials: ["ㅈ", "ㅉ"] },
  { slug: "c", label: "ㅊ", initials: ["ㅊ"] },
  { slug: "k", label: "ㅋ", initials: ["ㅋ"] },
  { slug: "t", label: "ㅌ", initials: ["ㅌ"] },
  { slug: "p", label: "ㅍ", initials: ["ㅍ"] },
  { slug: "h", label: "ㅎ", initials: ["ㅎ"] },
  { slug: "etc", label: "기타", initials: [] },
];

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const INITIAL_CONSONANT_SPAN = 588;
const INITIAL_CONSONANTS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

const FALLBACK_SLUG = "etc";

export function initialConsonant(name: string): string | undefined {
  const first = name.trim().normalize("NFC").codePointAt(0);
  if (first === undefined) return undefined;
  if (first < HANGUL_SYLLABLE_START || first > HANGUL_SYLLABLE_END)
    return undefined;
  const index = Math.floor(
    (first - HANGUL_SYLLABLE_START) / INITIAL_CONSONANT_SPAN,
  );
  return INITIAL_CONSONANTS[index];
}

export function groupSlugForName(name: string): string {
  const consonant = initialConsonant(name);
  if (!consonant) return FALLBACK_SLUG;
  return (
    GROUP_DEFINITIONS.find((group) => group.initials.includes(consonant))
      ?.slug ?? FALLBACK_SLUG
  );
}

export type DirectoryPage = {
  slug: string;
  label: string;
  pageNumber: number;
  pageCount: number;
  players: readonly SeoPlayer[];
};

export type DirectoryGroup = {
  slug: string;
  label: string;
  total: number;
  pages: readonly DirectoryPage[];
};

export function groupLabelForSlug(slug: string): string {
  return (
    GROUP_DEFINITIONS.find((group) => group.slug === slug)?.label ?? "기타"
  );
}

function comparePlayers(left: SeoPlayer, right: SeoPlayer): number {
  const byName = left.canonical_name.localeCompare(right.canonical_name, "ko");
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}

export function buildDirectoryGroups(
  players: readonly SeoPlayer[],
): DirectoryGroup[] {
  const buckets = new Map<string, SeoPlayer[]>();
  for (const player of players) {
    const slug = groupSlugForName(player.canonical_name);
    const bucket = buckets.get(slug);
    if (bucket) bucket.push(player);
    else buckets.set(slug, [player]);
  }
  return GROUP_DEFINITIONS.flatMap((definition) => {
    const bucket = buckets.get(definition.slug);
    if (!bucket || bucket.length === 0) return [];
    const sorted = [...bucket].sort(comparePlayers);
    const pageCount = Math.ceil(sorted.length / DIRECTORY_PAGE_SIZE);
    const pages = Array.from({ length: pageCount }, (_, index) => ({
      slug: definition.slug,
      label: definition.label,
      pageNumber: index + 1,
      pageCount,
      players: sorted.slice(
        index * DIRECTORY_PAGE_SIZE,
        (index + 1) * DIRECTORY_PAGE_SIZE,
      ),
    }));
    return [
      {
        slug: definition.slug,
        label: definition.label,
        total: sorted.length,
        pages,
      },
    ];
  });
}

export function directoryPath(slug?: string, pageNumber = 1): string {
  if (!slug) return "/directory";
  if (pageNumber <= 1) return `/directory/${slug}`;
  return `/directory/${slug}/${pageNumber}`;
}

export function directoryPaths(groups: readonly DirectoryGroup[]): string[] {
  return [
    directoryPath(),
    ...groups.flatMap((group) =>
      group.pages.map((page) => directoryPath(group.slug, page.pageNumber)),
    ),
  ];
}

function href(basePath: string, path: string): string {
  return `${basePath.replace(/\/+$/u, "")}${path}/`;
}

function playerSubtitle(player: SeoPlayer): string {
  const identity = [player.primary_region, player.primary_club]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  return identity || "지역·소속 미상";
}

// The directory pages ship without the application bundle, so they carry their
// own shell and the link back to the crawlable home page.
function shell(basePath: string, inner: string): string {
  return `<div class="app-shell seo-directory">
    <header class="site-header">
      <a class="brand" href="${escapeHtml(href(basePath, ""))}">
        <img src="${escapeHtml(`${basePath.replace(/\/+$/u, "")}/busu-logo.png`)}" alt="" aria-hidden="true" />
        <span>BUSU</span>
        <small>탁구 기록 통합검색</small>
      </a>
    </header>
    <main>
${inner}
    </main>
    <footer>
      <strong>BUSU</strong>
      <p>공개 대회 기록을 출처와 함께 제공합니다.</p>
    </footer>
  </div>`;
}

export function renderDirectoryRootBody(
  groups: readonly DirectoryGroup[],
  basePath: string,
): string {
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const items = groups
    .map(
      (group) =>
        `        <li><a href="${escapeHtml(href(basePath, directoryPath(group.slug)))}"><strong>${escapeHtml(group.label)}</strong> <span>${group.total.toLocaleString("ko-KR")}명</span></a></li>`,
    )
    .join("\n");
  return shell(
    basePath,
    `      <h1>탁구 선수 전체 목록</h1>
      <p>BUSU가 공개 대회 기록에서 확인한 선수 ${total.toLocaleString("ko-KR")}명을 이름 초성별로 정리했습니다.</p>
      <ul class="seo-directory-groups">
${items}
      </ul>`,
  );
}

export function renderDirectoryPageBody(
  page: DirectoryPage,
  basePath: string,
): string {
  const items = page.players
    .map(
      (player) =>
        `        <li><a href="${escapeHtml(href(basePath, `/players/${player.id}`))}"><strong>${escapeHtml(player.canonical_name)}</strong> <span>${escapeHtml(playerSubtitle(player))}</span></a></li>`,
    )
    .join("\n");
  const pagination =
    page.pageCount > 1
      ? `      <nav class="seo-directory-pagination" aria-label="페이지 목록">
${Array.from({ length: page.pageCount }, (_, index) => index + 1)
  .map((number) =>
    number === page.pageNumber
      ? `        <span aria-current="page">${number}</span>`
      : `        <a href="${escapeHtml(href(basePath, directoryPath(page.slug, number)))}">${number}</a>`,
  )
  .join("\n")}
      </nav>`
      : "";
  return shell(
    basePath,
    `      <nav class="seo-directory-breadcrumb" aria-label="상위 목록">
        <a href="${escapeHtml(href(basePath, directoryPath()))}">탁구 선수 전체 목록</a>
      </nav>
      <h1>${escapeHtml(page.label)}으로 시작하는 탁구 선수 (${page.pageNumber}/${page.pageCount})</h1>
      <ul class="seo-directory-players">
${items}
      </ul>
${pagination}`,
  );
}

export function renderDirectoryEntryLink(basePath: string): string {
  return `<nav class="seo-directory-entry" aria-label="선수 색인"><a href="${escapeHtml(href(basePath, directoryPath()))}">탁구 선수 전체 목록</a></nav>`;
}

export function directoryPageMetadataInput(page: DirectoryPage): {
  title: string;
  description: string;
} {
  const suffix =
    page.pageCount > 1 ? ` (${page.pageNumber}/${page.pageCount})` : "";
  return {
    title: `${page.label} 시작 선수 목록${suffix} · BUSU`,
    description: `이름이 ${page.label}으로 시작하는 탁구 선수 ${page.players.length}명의 부수·입상 기록 페이지 목록입니다.`,
  };
}
