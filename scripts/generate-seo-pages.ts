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

export type SeoPlayer = {
  id: string;
  canonical_name: string;
  homonym_nickname: string | null;
  primary_region: string | null;
  primary_club: string | null;
  result_count: number;
  source_count: number;
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function parseManifest(value: unknown): SeoPlayer[] {
  if (!Array.isArray(value))
    throw new Error("Public SEO manifest must be an array.");
  return value.map((row, index) => {
    if (typeof row !== "object" || row === null)
      throw new Error(`Invalid public SEO row ${index}.`);
    const candidate = row as Record<string, unknown>;
    const nullableText = (
      field: "primary_region" | "primary_club" | "homonym_nickname",
    ): string | null => {
      const item = candidate[field];
      if (item === null || (typeof item === "string" && item.length <= 200))
        return item;
      throw new Error(`Invalid ${field} in public SEO row ${index}.`);
    };
    if (typeof candidate.id !== "string" || !uuidPattern.test(candidate.id))
      throw new Error(`Invalid id in public SEO row ${index}.`);
    if (
      typeof candidate.canonical_name !== "string" ||
      candidate.canonical_name.trim().length === 0 ||
      candidate.canonical_name.length > 200
    )
      throw new Error(`Invalid canonical_name in public SEO row ${index}.`);
    if (
      !Number.isInteger(candidate.result_count) ||
      Number(candidate.result_count) < 0 ||
      !Number.isInteger(candidate.source_count) ||
      Number(candidate.source_count) < 0
    )
      throw new Error(`Invalid counts in public SEO row ${index}.`);
    return {
      id: candidate.id,
      canonical_name: candidate.canonical_name.trim(),
      homonym_nickname: nullableText("homonym_nickname"),
      primary_region: nullableText("primary_region"),
      primary_club: nullableText("primary_club"),
      result_count: Number(candidate.result_count),
      source_count: Number(candidate.source_count),
    };
  });
}

export async function fetchPublicPlayerManifest(options: {
  supabaseUrl: string;
  publishableKey: string;
  fetch?: typeof fetch;
  pageSize?: number;
  requestTimeoutMs?: number;
  maxDurationMs?: number;
  maxPages?: number;
  maxPlayers?: number;
}): Promise<SeoPlayer[]> {
  const fetcher = options.fetch ?? fetch;
  const pageSize = options.pageSize ?? 500;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const maxDurationMs = options.maxDurationMs ?? 120_000;
  const maxPages = options.maxPages ?? 50;
  const maxPlayers = options.maxPlayers ?? 25_000;
  if (pageSize < 1 || pageSize > 1_000)
    throw new Error("Public SEO manifest page size is out of bounds.");
  const rows: SeoPlayer[] = [];
  const startedAt = Date.now();
  let lastId: string | undefined;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const remainingMs = maxDurationMs - (Date.now() - startedAt);
    if (remainingMs <= 0)
      throw new Error("Public SEO manifest exceeded its time budget.");
    const endpoint = new URL(
      "/rest/v1/public_player_seo_manifest",
      options.supabaseUrl,
    );
    endpoint.searchParams.set(
      "select",
      "id,canonical_name,homonym_nickname,primary_region,primary_club,result_count,source_count",
    );
    endpoint.searchParams.set("source_count", "gt.0");
    endpoint.searchParams.set("order", "id.asc");
    endpoint.searchParams.set("limit", String(pageSize));
    if (lastId) endpoint.searchParams.set("id", `gt.${lastId}`);
    const response = await fetcher(endpoint, {
      signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
      headers: {
        apikey: options.publishableKey,
        Authorization: `Bearer ${options.publishableKey}`,
      },
    });
    if (!response.ok)
      throw new Error(`Public SEO manifest fetch failed (${response.status}).`);
    const page = parseManifest(await response.json());
    if (page.some((row, index) => index > 0 && row.id <= page[index - 1]!.id))
      throw new Error("Public SEO manifest page is not ordered by player id.");
    if (lastId && page[0] && page[0].id <= lastId)
      throw new Error("Public SEO manifest pagination did not advance.");
    rows.push(...page.filter((row) => row.source_count > 0));
    if (rows.length > maxPlayers)
      throw new Error("Public SEO manifest exceeded its player budget.");
    if (page.length < pageSize) break;
    lastId = page.at(-1)?.id;
    if (pageNumber === maxPages - 1)
      throw new Error("Public SEO manifest exceeded its page budget.");
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

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

export function renderSitemap(
  players: SeoPlayer[],
  extraPaths: readonly string[] = [],
): string {
  const urls = [
    buildCanonicalUrl("/"),
    ...extraPaths.map((path) => buildCanonicalUrl(path)),
    ...players.map((player) => buildCanonicalUrl(`/players/${player.id}`)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
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
  await writeFile(resolve(options.outputDirectory, "index.html"), template);
  await writeDirectoryPages(
    options.outputDirectory,
    rawTemplate,
    basePath,
    groups,
  );
  await writeFile(
    resolve(options.outputDirectory, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${buildCanonicalUrl("/sitemap.xml")}\n`,
  );
  await writeFile(
    resolve(options.outputDirectory, "sitemap.xml"),
    renderSitemap(parsedPlayers, directoryPaths(groups)),
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
