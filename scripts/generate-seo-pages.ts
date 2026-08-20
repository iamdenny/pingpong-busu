import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildCanonicalUrl,
  buildPageMetadata,
  buildPlayerMetadata,
  siteMetadata,
  type PageMetadataValue,
} from "../apps/web/src/lib/pageMetadata";
import {
  breadcrumbJsonLd,
  escapeHtml,
  escapeXml,
  jsonLdScript,
} from "./seo-html";
import { playerJsonLd, renderPlayerBody } from "./seo-player";
import {
  fetchPublicPlayerManifest,
  parseManifest,
  type SeoPlayer,
} from "./seo-manifest";
import {
  guideJsonLd,
  guideMetadata,
  renderGuideBody,
  GUIDE_PATH,
} from "./seo-guide";
import {
  buildDirectoryGroups,
  directoryPageMetadataInput,
  directoryPath,
  directoryPaths,
  renderDirectoryEntryLink,
  renderDirectoryPageBody,
  renderDirectoryRootBody,
  type DirectoryGroup,
} from "./seo-directory";

export { escapeHtml, escapeXml } from "./seo-html";
export {
  fetchPublicPlayerManifest,
  MAX_MANIFEST_AWARDS,
  parseManifest,
  type SeoAward,
  type SeoPlayer,
} from "./seo-manifest";

function metadataTags(metadata: PageMetadataValue, canonical?: string): string {
  const values = [
    `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="robots" content="${metadata.robots}" />`,
    ...(canonical
      ? [`<link rel="canonical" href="${escapeHtml(canonical)}" />`]
      : []),
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:site_name" content="${siteMetadata.name}" />`,
    `<meta property="og:type" content="${metadata.type}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    ...(canonical
      ? [`<meta property="og:url" content="${escapeHtml(canonical)}" />`]
      : []),
    `<meta property="og:image" content="${siteMetadata.imageUrl}" />`,
    `<meta property="og:image:secure_url" content="${siteMetadata.imageUrl}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${siteMetadata.imageAlt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${siteMetadata.imageUrl}" />`,
    `<meta name="twitter:image:alt" content="${siteMetadata.imageAlt}" />`,
  ];
  return `${values.join("\n    ")}\n    <title>${escapeHtml(metadata.title)}</title>`;
}

export function renderSeoHtml(
  template: string,
  metadata: PageMetadataValue,
  canonical?: string,
): string {
  const stripped = template
    .replace(
      /\s*<meta\s+(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*\/?>/gu,
      "",
    )
    .replace(/\s*<link\s+rel="canonical"[^>]*\/?>/gu, "")
    .replace(/\s*<title>[^<]*<\/title>/gu, "");
  return stripped.replace(
    "</head>",
    `    ${metadataTags(metadata, canonical)}\n  </head>`,
  );
}

const APP_SCRIPT_PATTERN =
  /\s*<script\b[^>]*\ssrc="(?!https?:)[^"]*"[^>]*>\s*<\/script>/gu;
const ROOT_CONTAINER = '<div id="root"></div>';

// Vite rewrites asset URLs with the deployment base, so the built template is
// the only reliable source for the base path the generated pages must use.
export function basePathFromTemplate(template: string): string {
  const asset = /(?:src|href)="([^"]*\/)assets\/[^"]*\.(?:js|css)"/u.exec(
    template,
  );
  const prefix = asset?.[1];
  return prefix && prefix.startsWith("/") ? prefix : "/";
}

// Re-running the generator over an already generated dist must stay safe, so a
// previously injected body is folded back to the empty container first.
const INJECTED_ROOT =
  /<div id="root">\s*<(nav|div|article)[^>]*class="[^"]*\bseo-[^"]*"[\s\S]*?<\/\1>\s*<\/div>/u;

export function withRootContent(html: string, content: string): string {
  const normalized = html.replace(INJECTED_ROOT, ROOT_CONTAINER);
  if (!normalized.includes(ROOT_CONTAINER))
    throw new Error("The build template no longer exposes an empty #root.");
  return normalized.replace(ROOT_CONTAINER, `<div id="root">${content}</div>`);
}

export function withoutAppScript(html: string): string {
  return html.replace(APP_SCRIPT_PATTERN, "");
}

export function withJsonLd(html: string, values: readonly unknown[]): string {
  if (values.length === 0) return html;
  const scripts = values
    .map((value) => `    ${jsonLdScript(value)}`)
    .join("\n");
  return html.replace("</head>", `${scripts}\n  </head>`);
}

export function sitemapDate(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

// Answer engines weigh freshness heavily, so every URL carries the newest date
// the underlying records were confirmed rather than the deployment timestamp.
export function latestCheckedDate(
  players: readonly SeoPlayer[],
): string | undefined {
  return players.reduce<string | undefined>((latest, player) => {
    const date = sitemapDate(player.last_checked_at);
    if (!date) return latest;
    return !latest || date > latest ? date : latest;
  }, undefined);
}

export function renderSitemap(
  players: SeoPlayer[],
  extraPaths: readonly string[] = [],
): string {
  const siteDate = latestCheckedDate(players);
  const entries = [
    { path: "/", lastmod: siteDate },
    ...extraPaths.map((path) => ({ path, lastmod: siteDate })),
    ...players.map((player) => ({
      path: `/players/${player.id}`,
      lastmod: sitemapDate(player.last_checked_at) ?? siteDate,
    })),
  ];
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod
      ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>`
      : "";
    return `  <url><loc>${escapeXml(buildCanonicalUrl(entry.path))}</loc>${lastmod}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// Crawlers that ground generative answers are named explicitly so the intent to
// be cited is unambiguous, including the tokens that are opt-out only.
const CITATION_CRAWLERS = [
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "Yeti",
  "Daumoa",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "DuckAssistBot",
  "Meta-ExternalAgent",
  "CCBot",
] as const;

export function renderRobots(): string {
  const groups = [
    ...CITATION_CRAWLERS.map((agent) => `User-agent: ${agent}\nAllow: /`),
    "User-agent: *\nAllow: /",
  ];
  return `${groups.join("\n\n")}\n\nSitemap: ${buildCanonicalUrl("/sitemap.xml")}\n`;
}

// llms.txt is a plain-text orientation file: it states what the site is, what
// the data does and does not mean, and where the dense pages live.
export function renderLlmsTxt(players: readonly SeoPlayer[]): string {
  const checked = latestCheckedDate(players);
  const lines = [
    "# BUSU",
    "",
    "> 공개 탁구 대회 기록에서 선수별 관측 부수, 소속, 출전·입상 이력을 원문 출처와 함께 모아 보여주는 한국어 서비스입니다.",
    "",
    ...(players.length > 0
      ? [
          `BUSU는 공개된 탁구 대회 기록 사이트에서 선수 ${players.length.toLocaleString("ko-KR")}명의 공개 기록을 모았습니다.`,
        ]
      : []),
    "BUSU는 부수를 판정하지 않습니다. 화면의 값은 공개 대회 기록에서 확인한 관측 부수이며 공식 등급이나 승급 판정이 아닙니다.",
    "입상은 우승·준우승·1~3위·2강·4강까지만 집계하고 8강 이하는 참가 이력으로 둡니다.",
    "이름이 같다는 이유만으로 선수를 자동 병합하지 않으며, 동명이인은 사용자가 입력한 탁구 별칭으로 구분합니다.",
    "전화번호, 이메일, 전체 생년월일, 주소 등 민감한 개인정보는 수집하지 않습니다.",
    ...(checked ? ["", `마지막 기록 확인일: ${checked}`] : []),
    "",
    "## 주요 문서",
    "",
    `- [탁구 부수 안내](${buildCanonicalUrl(GUIDE_PATH)}): 통합부수·지역부수·오픈부수·디비전부수의 차이와 지역별 통합부수 적용 시작일, 입상 집계 기준`,
    `- [탁구 선수 전체 목록](${buildCanonicalUrl("/directory")}): 이름 초성별 선수 색인`,
    `- [선수 상세 페이지](${buildCanonicalUrl("/players")}/{선수 id}/): 선수별 최근 관측 부수, 최근 입상 기록, 확인한 공개 출처`,
    "",
    "## 참고",
    "",
    `- [sitemap.xml](${buildCanonicalUrl("/sitemap.xml")})`,
    "",
  ];
  return lines.join("\n");
}

export async function generateSeoPages(options: {
  outputDirectory: string;
  players: SeoPlayer[];
}): Promise<void> {
  const parsedPlayers = parseManifest(options.players)
    .filter((player) => player.source_count > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const uniquePlayerIds = new Set(parsedPlayers.map((player) => player.id));
  if (uniquePlayerIds.size !== parsedPlayers.length)
    throw new Error("Public SEO manifest contains duplicate player ids.");
  const rawTemplate = await readFile(
    resolve(options.outputDirectory, "index.html"),
    "utf8",
  );
  const basePath = basePathFromTemplate(rawTemplate);
  const groups = buildDirectoryGroups(parsedPlayers);
  // Every app page ships the directory entry link inside #root so crawlers can
  // reach the index from the raw HTML; createRoot replaces it on mount.
  const template = withRootContent(
    rawTemplate,
    renderDirectoryEntryLink(basePath),
  );
  const playersDirectory = resolve(options.outputDirectory, "players");
  await rm(playersDirectory, { recursive: true, force: true });
  for (const player of parsedPlayers) {
    const directory = resolve(playersDirectory, player.id);
    await mkdir(directory, { recursive: true });
    const metadata = buildPlayerMetadata({
      name: player.canonical_name,
      nickname: player.homonym_nickname,
      region: player.primary_region,
      club: player.primary_club,
      awardCount: player.result_count,
      sourceCount: player.source_count,
    });
    await writeFile(
      resolve(directory, "index.html"),
      withRootContent(
        withJsonLd(
          renderSeoHtml(
            rawTemplate,
            metadata,
            buildCanonicalUrl(`/players/${player.id}`),
          ),
          playerJsonLd(player),
        ),
        renderPlayerBody(player, basePath),
      ),
    );
  }
  const searchDirectory = resolve(options.outputDirectory, "search");
  await mkdir(searchDirectory, { recursive: true });
  const searchMetadata = buildPageMetadata(
    "/search",
    "선수 검색 결과 · BUSU",
    "탁구 선수의 공개 대회 출전·입상 기록 검색 결과입니다.",
  );
  await writeFile(
    resolve(searchDirectory, "index.html"),
    renderSeoHtml(template, searchMetadata, buildCanonicalUrl("/search")),
  );
  const fallbackMetadata = buildPageMetadata(
    "/404",
    "페이지를 찾을 수 없습니다 · BUSU",
    "요청한 BUSU 페이지를 찾을 수 없습니다.",
  );
  fallbackMetadata.robots = "noindex,follow";
  await writeFile(
    resolve(options.outputDirectory, "404.html"),
    renderSeoHtml(template, fallbackMetadata),
  );
  await writeFile(
    resolve(options.outputDirectory, "index.html"),
    withJsonLd(template, [homeDatasetJsonLd(parsedPlayers)]),
  );
  await writeDirectoryPages(
    options.outputDirectory,
    rawTemplate,
    basePath,
    groups,
  );
  await writeGuidePage(
    options.outputDirectory,
    rawTemplate,
    basePath,
    parsedPlayers.length,
  );
  await writeFile(
    resolve(options.outputDirectory, "robots.txt"),
    renderRobots(),
  );
  await writeFile(
    resolve(options.outputDirectory, "llms.txt"),
    renderLlmsTxt(parsedPlayers),
  );
  await writeFile(
    resolve(options.outputDirectory, "sitemap.xml"),
    renderSitemap(parsedPlayers, [GUIDE_PATH, ...directoryPaths(groups)]),
  );
}

// A Dataset node tells an answer engine what the corpus is, how it was built
// and what it deliberately does not claim, which is the context a citation needs.
export function homeDatasetJsonLd(players: readonly SeoPlayer[]): unknown {
  const modified = latestCheckedDate(players);
  const dataset: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${siteMetadata.url}#dataset`,
    name: "BUSU 공개 탁구 대회 기록 모음",
    description:
      "공개된 탁구 대회 결과에서 모은 선수별 관측 부수, 소속, 출전·입상 기록과 원문 출처. 관측 부수는 공식 등급이나 승급 판정이 아니며 입상은 4강 이상만 집계한다.",
    url: siteMetadata.url,
    inLanguage: "ko-KR",
    isAccessibleForFree: true,
    creator: { "@id": `${siteMetadata.url}#organization` },
    isPartOf: { "@id": `${siteMetadata.url}#website` },
    keywords: [
      "탁구 부수",
      "통합부수",
      "지역부수",
      "디비전부수",
      "탁구 대회 입상 기록",
    ],
    measurementTechnique: "공개 대회 결과 페이지의 공개 게시 정보 수집",
    variableMeasured: [
      "관측 부수",
      "부수 체계",
      "대회 입상 성적",
      "소속",
      "지역",
      "원문 출처",
    ],
  };
  if (players.length > 0)
    dataset.size = `선수 ${players.length.toLocaleString("ko-KR")}명`;
  if (modified) dataset.dateModified = modified;
  return dataset;
}

// The guide is a plain document as well: it explains the domain rules the rest
// of the site assumes, which is the content an answer engine can quote directly.
async function writeGuidePage(
  outputDirectory: string,
  rawTemplate: string,
  basePath: string,
  playerCount: number,
): Promise<void> {
  const target = resolve(outputDirectory, GUIDE_PATH.replace(/^\//u, ""));
  await mkdir(target, { recursive: true });
  const metadata = buildPageMetadata(
    GUIDE_PATH,
    guideMetadata.title,
    guideMetadata.description,
  );
  await writeFile(
    resolve(target, "index.html"),
    withRootContent(
      withoutAppScript(
        withJsonLd(
          renderSeoHtml(rawTemplate, metadata, buildCanonicalUrl(GUIDE_PATH)),
          guideJsonLd(),
        ),
      ),
      renderGuideBody(basePath, playerCount),
    ),
  );
}

// Directory pages are plain documents: the SPA has no matching route, so the
// application bundle is dropped and the crawlable list is the whole body.
async function writeDirectoryPages(
  outputDirectory: string,
  rawTemplate: string,
  basePath: string,
  groups: readonly DirectoryGroup[],
): Promise<void> {
  const root = resolve(outputDirectory, "directory");
  await rm(root, { recursive: true, force: true });
  const write = async (
    path: string,
    title: string,
    description: string,
    body: string,
    crumbs: readonly { name: string; url: string }[] = [],
  ): Promise<void> => {
    const target = resolve(outputDirectory, path.replace(/^\//u, ""));
    await mkdir(target, { recursive: true });
    const metadata = buildPageMetadata(path, title, description);
    await writeFile(
      resolve(target, "index.html"),
      withRootContent(
        withoutAppScript(
          withJsonLd(
            renderSeoHtml(rawTemplate, metadata, buildCanonicalUrl(path)),
            crumbs.length > 0 ? [breadcrumbJsonLd(crumbs)] : [],
          ),
        ),
        body,
      ),
    );
  };
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const home = { name: "BUSU 홈", url: buildCanonicalUrl("/") };
  const listRoot = {
    name: "탁구 선수 전체 목록",
    url: buildCanonicalUrl(directoryPath()),
  };
  await write(
    directoryPath(),
    "탁구 선수 전체 목록 · BUSU",
    `BUSU가 공개 대회 기록에서 확인한 탁구 선수 ${total.toLocaleString("ko-KR")}명을 이름 초성별로 찾아보세요.`,
    renderDirectoryRootBody(groups, basePath),
    [home, listRoot],
  );
  for (const group of groups)
    for (const page of group.pages) {
      const metadata = directoryPageMetadataInput(page);
      const path = directoryPath(group.slug, page.pageNumber);
      await write(
        path,
        metadata.title,
        metadata.description,
        renderDirectoryPageBody(page, basePath),
        [
          home,
          listRoot,
          { name: `${group.label} 시작 선수`, url: buildCanonicalUrl(path) },
        ],
      );
    }
}

export async function generateSeoPagesFromEnvironment(
  outputDirectory: string,
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const required = environment.SEO_MANIFEST_REQUIRED === "true";
  const supabaseUrl = environment.VITE_SUPABASE_URL;
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    if (required)
      throw new Error(
        "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required for SEO generation.",
      );
    await generateSeoPages({ outputDirectory, players: [] });
    return;
  }
  const players = await fetchPublicPlayerManifest({
    supabaseUrl,
    publishableKey,
    fetch: fetcher,
  });
  if (required && players.length === 0)
    throw new Error("The required public SEO manifest is empty.");
  await generateSeoPages({ outputDirectory, players });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await generateSeoPagesFromEnvironment(
    resolve(process.argv[2] ?? "apps/web/dist"),
  );
}
