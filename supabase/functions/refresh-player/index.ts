import { createClient } from "npm:@supabase/supabase-js@2";
import iconv from "npm:iconv-lite@0.7.0";
import {
  classifyIpingSessionHtml,
  extractIpingSessionCookie,
  extractIpingSessionCookieFromHeaders,
  extractIpingSessionId,
  fetchWithRetry,
  ipingBrowserNavigationHeaders,
  parseAirpingSearchHtml,
  parseAstreeSearchHtml,
  parseIpingSearchHtml,
  parseMyttSearchForm,
  parseMyttSearchHtml,
  parseNewttplaySearchHtml,
  parseOkPingpongSearchHtml,
  parseSuperstarSearchHtml,
  parseTtaDivisionSearchResponse,
  parseYonginCafeSearchResponse,
} from "../_shared/generated/astree-parser.js";
import { hasValidPublishableApiKey } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { isSafeIpingPlayerName } from "../_shared/iping-query.ts";
import { isRecord, normalizeName } from "../_shared/normalize.ts";
import { reportOperationalIncident } from "../_shared/operational-incidents.ts";
import { hashRequestOrigin } from "../_shared/request-origin.ts";
import {
  SafeSourceError,
  publicSourceError,
  retryAfterMilliseconds,
} from "../_shared/source-errors.ts";
import { ttaDivisionCa } from "../_shared/tta-ca.ts";
import { hasValidWorkerAuthorization } from "../_shared/worker-auth.ts";

const sourceCodes = [
  "mock",
  "airping",
  "astree",
  "newttplay",
  "ttadivision",
  "okpingpong",
  "mytt",
  "superstar",
  "yongintt",
  "iping",
  "band",
] as const;
type SourceCode = (typeof sourceCodes)[number];
type LiveSourceCode = Exclude<SourceCode, "mock" | "band">;
type EdgeRuntimeGlobal = typeof globalThis & {
  EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
};

function scheduleBackground(task: Promise<unknown>): void {
  const safeTask = task.catch(() => undefined);
  const edgeRuntime = (globalThis as EdgeRuntimeGlobal).EdgeRuntime;
  if (edgeRuntime) edgeRuntime.waitUntil(safeTask);
  else void safeTask;
}
interface RefreshInput {
  name: string;
  club?: string;
  region?: string;
  sourceCodes?: SourceCode[];
  force: boolean;
}

const sourceFlags: Record<LiveSourceCode, string> = {
  airping: "CRAWLER_SOURCE_AIRPING_ENABLED",
  astree: "CRAWLER_SOURCE_ASTREE_ENABLED",
  newttplay: "CRAWLER_SOURCE_NEWTTPLAY_ENABLED",
  ttadivision: "CRAWLER_SOURCE_TTADIVISION_ENABLED",
  okpingpong: "CRAWLER_SOURCE_OKPINGPONG_ENABLED",
  mytt: "CRAWLER_SOURCE_MYTT_ENABLED",
  superstar: "CRAWLER_SOURCE_SUPERSTAR_ENABLED",
  yongintt: "CRAWLER_SOURCE_YONGINTT_ENABLED",
  iping: "CRAWLER_SOURCE_IPING_ENABLED",
};

const parserVersions: Record<LiveSourceCode, string> = {
  airping: "airping-3",
  astree: "astree-6",
  newttplay: "newttplay-2",
  ttadivision: "ttadivision-1",
  okpingpong: "okpingpong-4",
  mytt: "mytt-3",
  superstar: "superstar-2",
  yongintt: "yongintt-4",
  iping: "iping-4",
};

const airpingRetryAfterMs = 5_000;

type SourceDiagnosticPhase =
  | "fetch"
  | "login_page"
  | "login_submit"
  | "login_verify"
  | "entry_search"
  | "nationwide_awards_search"
  | "district_awards_search"
  | "parse"
  | "persist"
  | "complete";

function parseInput(value: unknown): RefreshInput {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    value.name.trim().length < 2 ||
    value.name.length > 50
  )
    throw new Error("invalid_name");
  if (value.force !== undefined && typeof value.force !== "boolean")
    throw new Error("invalid_force");
  const requested = value.sourceCodes;
  if (
    requested !== undefined &&
    (!Array.isArray(requested) ||
      requested.length > sourceCodes.length ||
      requested.some(
        (code) =>
          typeof code !== "string" || !sourceCodes.includes(code as SourceCode),
      ))
  )
    throw new Error("invalid_source_codes");
  return {
    name: value.name.trim(),
    ...(typeof value.club === "string" ? { club: value.club.trim() } : {}),
    ...(typeof value.region === "string"
      ? { region: value.region.trim() }
      : {}),
    ...(requested
      ? { sourceCodes: [...new Set(requested as SourceCode[])] }
      : {}),
    force: value.force === true,
  };
}

async function fetchTtaDivisionRecords(
  name: string,
  fetchedAt: string,
): Promise<Array<Record<string, unknown>>> {
  const userAgent = Deno.env.get("CRAWLER_USER_AGENT") ?? "BUSU";
  const client = Deno.createHttpClient({ caCerts: [ttaDivisionCa] });
  try {
    const pageResponse = await fetch(
      "https://ttadivision.sports.or.kr/statistic/moveSearchOteamPlayer.do",
      {
        client,
        signal: AbortSignal.timeout(8000),
        headers: { accept: "text/html", "user-agent": userAgent },
        redirect: "follow",
      },
    );
    assertSourceResponse(pageResponse, "대한탁구협회 디비전");
    const html = await pageResponse.text();
    const csrfToken =
      /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/iu.exec(
        html,
      )?.[1];
    const cookie = pageResponse.headers.get("set-cookie")?.split(";", 1)[0];
    if (!csrfToken || !cookie || !html.includes("searchOteamPlayer.js"))
      throw new Error("대한탁구협회 디비전 검색 식별자 변경");
    const body = new URLSearchParams({
      sigunguCd: "ALL",
      selectSize: "100",
      nameSolt: "1",
      searchScrGbn: "PP",
      ttStart: "0",
      ttEnd: "9999",
      searchValue: name,
      memberNm: name,
      pageIndex: "1",
    });
    const response = await fetch(
      "https://ttadivision.sports.or.kr/statistic/selectSearchOteamPlyrList.do",
      {
        client,
        method: "POST",
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
        body,
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
          cookie,
          "x-csrf-token": csrfToken,
          "user-agent": userAgent,
        },
      },
    );
    assertSourceResponse(response, "대한탁구협회 디비전");
    return parseTtaDivisionSearchResponse(
      await response.json(),
      name,
      fetchedAt,
    ) as Array<Record<string, unknown>>;
  } finally {
    client.close();
  }
}

function assertSourceResponse(response: Response, sourceName: string): void {
  if (response.status === 403)
    throw new SafeSourceError(
      "source_blocked",
      `${sourceName}이 BUSU의 조회 요청을 차단했습니다.`,
    );
  if (response.status === 429)
    throw new SafeSourceError(
      "source_rate_limited",
      `${sourceName}의 호출 제한에 도달했습니다.`,
      retryAfterMilliseconds(response.headers.get("retry-after")),
    );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

function assertPublicHtmlResponse(
  response: Response,
  sourceName: string,
): void {
  assertSourceResponse(response, sourceName);
  if (
    !(response.headers.get("content-type") ?? "")
      .toLocaleLowerCase()
      .includes("text/html")
  )
    throw new Error(`${sourceName} 검색 구조 변경`);
}

async function readHtmlAllowingEarlyClose(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    if (!html) throw error;
  }
  return html + decoder.decode();
}

async function fetchSimpleHtmlRecords(
  sourceCode: "airping" | "okpingpong",
  name: string,
  fetchedAt: string,
): Promise<Array<Record<string, unknown>>> {
  const userAgent = Deno.env.get("CRAWLER_USER_AGENT") ?? "BUSU";
  const url =
    sourceCode === "airping"
      ? new URL("https://airping.co.kr/11player/01.php")
      : new URL("http://okpingpong.co.kr/04match/08.php");
  url.searchParams.set("key", sourceCode === "airping" ? "r_name" : "name");
  url.searchParams.set("keyword", name);
  const response = await fetchWithRetry(
    url,
    {
      headers: { accept: "text/html", "user-agent": userAgent },
      redirect: "follow",
    },
    sourceCode === "airping"
      ? { timeoutMs: 10_000, maxAttempts: 1, retryDelayMs: 250 }
      : { timeoutMs: 10_000, maxAttempts: 2, retryDelayMs: 250 },
  );
  assertPublicHtmlResponse(response, sourceCode);
  const html = await response.text();
  return (
    sourceCode === "airping"
      ? parseAirpingSearchHtml(html, name, fetchedAt)
      : parseOkPingpongSearchHtml(html, name, fetchedAt)
  ) as Array<Record<string, unknown>>;
}

async function fetchMemberSearchRecords(
  sourceCode: "astree" | "newttplay",
  name: string,
  fetchedAt: string,
): Promise<Array<Record<string, unknown>>> {
  const maxHtmlBytes = 2 * 1024 * 1024;
  const source =
    sourceCode === "astree"
      ? {
          baseUrl: "https://astree.co.kr/bbs/board.php",
          displayName: "애즈트리",
          parse: parseAstreeSearchHtml,
        }
      : {
          baseUrl: "https://www.newttplay.co.kr/bbs/board.php",
          displayName: "뉴티티플레이",
          parse: parseNewttplaySearchHtml,
        };
  const records: Array<Record<string, unknown>> = [];
  for (let page = 1; page <= 2; page += 1) {
    const url = new URL(source.baseUrl);
    url.searchParams.set("bo_table", "member_search");
    url.searchParams.set("sfl", "wr_subject");
    url.searchParams.set("stx", name);
    url.searchParams.set("page", String(page));
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: "text/html",
        "user-agent": Deno.env.get("CRAWLER_USER_AGENT") ?? "BUSU",
      },
      redirect: sourceCode === "newttplay" ? "manual" : "follow",
    });
    if (
      sourceCode === "newttplay" &&
      response.status >= 300 &&
      response.status < 400
    ) {
      throw new SafeSourceError(
        "source_blocked",
        "뉴티티플레이가 허용되지 않은 redirect를 반환했습니다.",
      );
    }
    assertPublicHtmlResponse(response, source.displayName);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxHtmlBytes) {
      await response.body?.cancel();
      throw new SafeSourceError(
        "source_schema_changed",
        `${source.displayName} HTML 응답 크기가 제한을 초과했습니다.`,
      );
    }
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let html = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxHtmlBytes) {
          await reader.cancel();
          throw new SafeSourceError(
            "source_schema_changed",
            `${source.displayName} HTML 응답 크기가 제한을 초과했습니다.`,
          );
        }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    }
    const parsed = source.parse(html, name, fetchedAt) as Array<
      Record<string, unknown>
    >;
    records.push(...parsed);
    if (parsed.length === 0 || !html.includes(`page=${page + 1}`)) break;
  }
  return records;
}

async function fetchSuperstarRecords(
  name: string,
  fetchedAt: string,
): Promise<Array<Record<string, unknown>>> {
  const url = new URL("https://www.superstar.kr/open/Do.jsp");
  url.searchParams.set("urlSeq", "302");
  url.searchParams.set("userNm", name);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      accept: "text/html",
      "user-agent": Deno.env.get("CRAWLER_USER_AGENT") ?? "BUSU",
    },
    redirect: "follow",
  });
  assertPublicHtmlResponse(response, "슈퍼스타탁구");
  return parseSuperstarSearchHtml(
    await response.text(),
    name,
    fetchedAt,
  ) as Array<Record<string, unknown>>;
}

async function fetchYonginCafeRecords(
  name: string,
  fetchedAt: string,
): Promise<Array<Record<string, unknown>>> {
  const apiKey = Deno.env.get("KAKAO_REST_API_KEY");
  if (!apiKey)
    throw new SafeSourceError(
      "source_not_configured",
      "카카오 REST API 키가 설정되지 않았습니다.",
    );
  const url = new URL("https://dapi.kakao.com/v2/search/cafe");
  url.searchParams.set("query", `${name} 대회`);
  url.searchParams.set("sort", "recency");
  url.searchParams.set("page", "1");
  url.searchParams.set("size", "50");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      accept: "application/json",
      authorization: `KakaoAK ${apiKey}`,
      "user-agent": Deno.env.get("CRAWLER_USER_AGENT") ?? "BUSU",
    },
  });
  if (response.status === 401 || response.status === 403)
    throw new SafeSourceError(
      "source_auth_failed",
      "카카오 REST API 인증을 확인해 주세요.",
    );
  if (response.status === 429)
    throw new SafeSourceError(
      "source_rate_limited",
      "카카오 무료 검색 쿼터 또는 요청 제한에 도달했습니다.",
      retryAfterMilliseconds(response.headers.get("retry-after")),
    );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (
    !(response.headers.get("content-type") ?? "")
      .toLocaleLowerCase()
      .includes("application/json")
  )
    throw new Error("카카오 카페 검색 구조 변경");
  const parsed = parseYonginCafeSearchResponse(
    await response.json(),
    name,
    fetchedAt,
  ) as { records: Array<Record<string, unknown>> };
  return parsed.records;
}

const ipingBaseUrl = "https://www.iping.club/";
const ipingUnescapedByte = /^[A-Za-z0-9_.~-]$/u;

function encodeIpingComponent(value: string): string {
  return [...iconv.encode(value, "cp949")]
    .map((byte) => {
      const character = String.fromCharCode(byte);
      return ipingUnescapedByte.test(character)
        ? character
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

function encodeIpingForm(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields)
    .map(
      ([key, value]) =>
        `${encodeIpingComponent(key)}=${encodeIpingComponent(value)}`,
    )
    .join("&");
}

function ipingCookie(response: Response): string | undefined {
  return extractIpingSessionCookieFromHeaders(response.headers);
}

async function decodeIpingResponse(response: Response): Promise<string> {
  return iconv.decode(new Uint8Array(await response.arrayBuffer()), "cp949");
}

function assertIpingHtmlResponse(response: Response, label: string): void {
  if (response.status === 403)
    throw new SafeSourceError(
      "source_blocked",
      "아이핑 접근이 차단되었습니다.",
    );
  if (response.status === 429)
    throw new SafeSourceError(
      "source_rate_limited",
      "아이핑 요청 제한에 도달했습니다.",
      retryAfterMilliseconds(response.headers.get("retry-after")),
    );
  if (response.status === 408 || response.status >= 500)
    throw new SafeSourceError(
      "source_request_failed",
      `아이핑 ${label} 요청이 일시적으로 실패했습니다.`,
    );
  if (!response.ok)
    throw new SafeSourceError(
      "source_schema_changed",
      `아이핑 ${label} 요청 규격을 확인하지 못했습니다.`,
    );
  if (
    !(response.headers.get("content-type") ?? "")
      .toLocaleLowerCase()
      .includes("text/html")
  )
    throw new Error(`아이핑 ${label} 검색 구조 변경`);
}

async function fetchIpingRecords(
  name: string,
  fetchedAt: string,
  onPhase: (phase: SourceDiagnosticPhase) => void,
): Promise<Array<Record<string, unknown>>> {
  const username = Deno.env.get("IPING_USERNAME");
  const password = Deno.env.get("IPING_PASSWORD");
  if (!username || !password)
    throw new SafeSourceError(
      "source_not_configured",
      "아이핑 전용 계정 Secret이 설정되지 않았습니다.",
    );
  const baseHeaders = { ...ipingBrowserNavigationHeaders };
  const loginUrl = `${ipingBaseUrl}?pg=login`;
  onPhase("login_page");
  const loginPage = await fetchWithRetry(
    loginUrl,
    { headers: baseHeaders, redirect: "manual" },
    { timeoutMs: 12_000, maxAttempts: 2, retryDelayMs: 250 },
  );
  assertIpingHtmlResponse(loginPage, "로그인 화면");
  const loginPageHtml = await decodeIpingResponse(loginPage);
  const headerCookie = ipingCookie(loginPage);
  const formSessionId = extractIpingSessionId(loginPageHtml);
  if (!formSessionId)
    throw new SafeSourceError(
      "source_schema_changed",
      "아이핑 로그인 폼 토큰을 찾지 못했습니다.",
    );
  const initialCookie =
    headerCookie ?? extractIpingSessionCookie(loginPageHtml);
  if (!initialCookie)
    throw new SafeSourceError(
      "source_schema_changed",
      "아이핑 로그인 세션 구조 점검이 필요합니다.",
    );
  onPhase("login_submit");
  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    redirect: "manual",
    body: encodeIpingForm({
      PHPSESSID: formSessionId,
      path: "",
      pg: "login",
      Mid: username,
      Pwd: password,
    }),
    headers: {
      ...baseHeaders,
      cookie: initialCookie,
      origin: new URL(ipingBaseUrl).origin,
      referer: loginUrl,
      "content-type": "application/x-www-form-urlencoded; charset=euc-kr",
    },
  });
  if (loginResponse.status === 403)
    throw new SafeSourceError(
      "source_blocked",
      "아이핑 접근이 차단되었습니다.",
    );
  if (loginResponse.status === 429)
    throw new SafeSourceError(
      "source_rate_limited",
      "아이핑 요청 제한에 도달했습니다.",
      retryAfterMilliseconds(loginResponse.headers.get("retry-after")),
    );
  if (loginResponse.status === 408 || loginResponse.status >= 500)
    throw new SafeSourceError(
      "source_request_failed",
      "아이핑 로그인 요청이 일시적으로 실패했습니다.",
    );
  if (loginResponse.status >= 400)
    throw new SafeSourceError(
      "source_schema_changed",
      "아이핑 로그인 요청 규격을 확인하지 못했습니다.",
    );
  const sessionCookie = ipingCookie(loginResponse) ?? initialCookie;
  let verificationResponse = loginResponse;
  onPhase("login_verify");
  if (loginResponse.status >= 300 && loginResponse.status < 400) {
    const destination = new URL(
      loginResponse.headers.get("location") ?? "/",
      ipingBaseUrl,
    ).toString();
    verificationResponse = await fetchWithRetry(
      destination,
      {
        headers: { ...baseHeaders, cookie: sessionCookie, referer: loginUrl },
        redirect: "follow",
      },
      { timeoutMs: 12_000, maxAttempts: 2, retryDelayMs: 250 },
    );
  }
  assertIpingHtmlResponse(verificationResponse, "로그인 확인");
  const verificationHtml = await decodeIpingResponse(verificationResponse);
  const verificationPage = classifyIpingSessionHtml(verificationHtml);
  if (verificationPage === "challenge")
    throw new SafeSourceError(
      "source_blocked",
      "아이핑 사람 확인 절차가 필요합니다.",
    );
  if (verificationPage === "guest")
    throw new SafeSourceError(
      "source_auth_failed",
      "아이핑 계정 인증에 실패했습니다.",
    );
  if (verificationPage !== "authenticated")
    throw new SafeSourceError(
      "source_schema_changed",
      "아이핑 로그인 성공 화면 구조를 확인하지 못했습니다.",
    );

  const search = async (
    suffix: string,
    phase: SourceDiagnosticPhase,
  ): Promise<string> => {
    onPhase(phase);
    const query = encodeIpingForm({ pg: "Search", SchVal: name });
    const response = await fetchWithRetry(
      `${ipingBaseUrl}?${query}${suffix}`,
      {
        headers: {
          ...baseHeaders,
          cookie: sessionCookie,
          referer: `${ipingBaseUrl}?pg=Search`,
        },
        redirect: "follow",
      },
      { timeoutMs: 12_000, maxAttempts: 2, retryDelayMs: 250 },
    );
    assertIpingHtmlResponse(response, "선수 검색");
    const html = await decodeIpingResponse(response);
    const sessionPage = classifyIpingSessionHtml(html);
    if (sessionPage === "challenge")
      throw new SafeSourceError(
        "source_blocked",
        "아이핑 사람 확인 절차가 필요합니다.",
      );
    if (sessionPage === "guest")
      throw new SafeSourceError(
        "source_auth_failed",
        "아이핑 인증 세션이 만료되었습니다.",
      );
    return html;
  };
  const entriesHtml = await search("&B=Y", "entry_search");
  const nationwideAwardsHtml = await search(
    "&Ctype=A",
    "nationwide_awards_search",
  );
  const districtAwardsHtml = await search("&Ctype=B", "district_awards_search");
  onPhase("parse");
  return [
    ...(parseIpingSearchHtml(entriesHtml, name, fetchedAt, "entry") as Array<
      Record<string, unknown>
    >),
    ...(parseIpingSearchHtml(
      nationwideAwardsHtml,
      name,
      fetchedAt,
      "award",
    ) as Array<Record<string, unknown>>),
    ...(parseIpingSearchHtml(
      districtAwardsHtml,
      name,
      fetchedAt,
      "award",
    ) as Array<Record<string, unknown>>),
  ];
}

async function fetchMyttRecords(
  name: string,
  club: string | undefined,
  fetchedAt: string,
): Promise<Array<Record<string, unknown>>> {
  const url = "https://mytt.kr/main/player_list.xhtml";
  const userAgent = Deno.env.get("CRAWLER_USER_AGENT") ?? "BUSU";
  const headers = {
    accept: "text/html",
    "accept-encoding": "identity",
    "user-agent": userAgent,
  };
  const client = Deno.createHttpClient({ caCerts: [ttaDivisionCa] });
  try {
    let pageResponse: Response;
    try {
      pageResponse = await fetch(url, {
        client,
        signal: AbortSignal.timeout(8000),
        headers,
        redirect: "follow",
      });
    } catch {
      throw new SafeSourceError(
        "source_request_failed",
        "마이티티 공개 검색 form에 연결하지 못했습니다.",
      );
    }
    assertPublicHtmlResponse(pageResponse, "마이티티");
    const pageHtml = await pageResponse.text();
    let form: { viewState: string; submitButton: string };
    try {
      form = parseMyttSearchForm(pageHtml);
    } catch {
      throw new SafeSourceError(
        "source_schema_changed",
        "마이티티 검색 form 구조 점검이 필요합니다.",
      );
    }
    const cookie = pageResponse.headers.get("set-cookie")?.split(";", 1)[0];
    if (!cookie)
      throw new SafeSourceError(
        "source_schema_changed",
        "마이티티 검색 세션 구조 점검이 필요합니다.",
      );
    const body = new URLSearchParams({
      mainForm: "mainForm",
      "mainForm:playerName": name,
      "mainForm:clubName": club ?? "",
      "mainForm:contestName": "",
      "mainForm:scale_input": "",
      [form.submitButton]: form.submitButton,
      "javax.faces.ViewState": form.viewState,
    });
    let response: Response;
    try {
      response = await fetch(url, {
        client,
        method: "POST",
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
        body,
        headers: {
          ...headers,
          cookie,
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        },
      });
    } catch {
      throw new SafeSourceError(
        "source_request_failed",
        "마이티티 공개 검색 요청을 완료하지 못했습니다.",
      );
    }
    assertPublicHtmlResponse(response, "마이티티");
    try {
      return parseMyttSearchHtml(
        await readHtmlAllowingEarlyClose(response),
        name,
        fetchedAt,
      ) as Array<Record<string, unknown>>;
    } catch {
      throw new SafeSourceError(
        "source_schema_changed",
        "마이티티 검색 결과 구조 점검이 필요합니다.",
      );
    }
  } finally {
    client.close();
  }
}

interface WorkerCounters {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  skipped: number;
}

const emptyWorkerCounters = (): WorkerCounters => ({
  claimed: 0,
  succeeded: 0,
  retried: 0,
  failed: 0,
  skipped: 0,
});

type IpingWorkerMode = "drain-iping" | "recover-iping";

function isIpingWorkerInput(
  value: unknown,
): value is { mode: IpingWorkerMode } {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    (value.mode === "drain-iping" || value.mode === "recover-iping")
  );
}

function hasIpingRecoveryRuntime(): boolean {
  return (
    Deno.env.get("CRAWL_LIVE") === "true" &&
    Deno.env.get("CRAWLER_SOURCE_IPING_ENABLED") === "true" &&
    Boolean(Deno.env.get("IPING_USERNAME")) &&
    Boolean(Deno.env.get("IPING_PASSWORD"))
  );
}

type EdgeSupabaseClient = ReturnType<typeof createClient>;

function reportIpingIncident(
  client: EdgeSupabaseClient,
  errorCode: string,
): void {
  if (
    errorCode !== "source_schema_changed" &&
    errorCode !== "source_auth_failed"
  )
    return;
  scheduleBackground(
    reportOperationalIncident(
      {
        eventId: crypto.randomUUID(),
        category: errorCode,
        appVersion: "unknown",
        sourceCode: "iping",
        parserVersion: parserVersions.iping,
      },
      {
        rpc: async (name, parameters) => {
          const { data, error } = await client.rpc(name, parameters);
          return {
            data,
            ...(error ? { error: { message: error.message } } : {}),
          };
        },
        fetch,
        githubRepository: Deno.env.get("GITHUB_ISSUES_REPOSITORY"),
        githubToken: Deno.env.get("GITHUB_ISSUES_TOKEN"),
      },
    ),
  );
}

function isIpingKillSwitchError(errorCode: string): boolean {
  return (
    errorCode === "source_auth_failed" ||
    errorCode === "source_schema_changed" ||
    errorCode === "source_blocked" ||
    errorCode === "source_not_configured"
  );
}

async function drainOneIpingJob(
  client: EdgeSupabaseClient,
): Promise<{ counters: WorkerCounters; status: number }> {
  const counters = emptyWorkerCounters();
  if (
    Deno.env.get("CRAWL_LIVE") !== "true" ||
    Deno.env.get(sourceFlags.iping) !== "true"
  ) {
    counters.skipped = 1;
    return { counters, status: 200 };
  }
  const { data: source, error: sourceError } = await client
    .from("sources")
    .select("enabled")
    .eq("code", "iping")
    .maybeSingle();
  if (sourceError) {
    counters.failed = 1;
    return { counters, status: 500 };
  }
  if (!source?.enabled) {
    counters.skipped = 1;
    return { counters, status: 200 };
  }

  const leaseToken = crypto.randomUUID();
  const { data: claim, error: claimError } = await client.rpc(
    "claim_iping_refresh_job",
    { p_lease_token: leaseToken },
  );
  if (claimError || !isRecord(claim)) {
    counters.failed = 1;
    return { counters, status: 500 };
  }
  if (claim.status !== "claimed") {
    counters.skipped = 1;
    return { counters, status: 200 };
  }
  const jobId = claim.jobId;
  const queryName = claim.queryName;
  const queryKey = claim.queryKey;
  const attemptCount = claim.attemptCount;
  if (
    (typeof jobId !== "number" && typeof jobId !== "string") ||
    typeof queryName !== "string" ||
    typeof queryKey !== "string" ||
    typeof attemptCount !== "number" ||
    !isSafeIpingPlayerName(queryName) ||
    queryKey.length < 1 ||
    queryKey.length > 50
  ) {
    counters.failed = 1;
    return { counters, status: 500 };
  }
  counters.claimed = 1;
  const requestStartedAt = Date.now();
  let diagnosticPhase: SourceDiagnosticPhase = "fetch";
  try {
    const fetchedAt = new Date().toISOString();
    const records = await fetchIpingRecords(queryName, fetchedAt, (phase) => {
      diagnosticPhase = phase;
    });
    const unique = [
      ...new Map(
        records.map((record) => [String(record.naturalKeyHash), record]),
      ).values(),
    ];
    diagnosticPhase = "persist";
    const { data: summary, error: persistError } = await client.rpc(
      "upsert_source_records_with_regions",
      {
        p_source_code: "iping",
        p_query_name: queryName,
        p_query_key: queryKey,
        p_records: unique,
        p_parser_version: parserVersions.iping,
      },
    );
    if (persistError || !isRecord(summary))
      throw new SafeSourceError(
        "source_persist_failed",
        "정규화한 출처 기록을 저장하지 못했습니다.",
      );
    const refreshId = summary.refreshId;
    if (typeof refreshId !== "number" && typeof refreshId !== "string")
      throw new SafeSourceError(
        "source_persist_failed",
        "정규화한 출처 기록을 저장하지 못했습니다.",
      );
    diagnosticPhase = "complete";
    const { error: outcomeError } = await client.rpc(
      "record_source_request_outcome",
      {
        p_source_code: "iping",
        p_error_code: null,
        p_phase: diagnosticPhase,
        p_duration_ms: Date.now() - requestStartedAt,
      },
    );
    if (outcomeError)
      throw new SafeSourceError(
        "source_refresh_failed",
        "출처 보호 상태를 기록하지 못했습니다.",
      );
    const { data: resolution, error: resolutionError } = await client.rpc(
      "resolve_iping_refresh_job",
      {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_refresh_id: refreshId,
        p_error_code: null,
        p_retry_after_ms: null,
      },
    );
    if (
      resolutionError ||
      !isRecord(resolution) ||
      resolution.status !== "succeeded"
    ) {
      counters.failed = 1;
      return { counters, status: 500 };
    }
    counters.succeeded = 1;
    return { counters, status: 200 };
  } catch (error) {
    const safe = publicSourceError(error);
    try {
      await client.rpc("record_source_refresh_failure", {
        p_source_code: "iping",
        p_error_code: safe.code,
      });
    } catch {
      // Diagnostics must never replace the original safe source outcome.
    }
    let resolutionErrorCode = safe.code;
    try {
      const { error: outcomeError } = await client.rpc(
        "record_source_request_outcome",
        {
          p_source_code: "iping",
          p_error_code: safe.code,
          p_phase: diagnosticPhase,
          p_duration_ms: Date.now() - requestStartedAt,
        },
      );
      if (outcomeError && !isIpingKillSwitchError(safe.code))
        resolutionErrorCode = "source_refresh_failed";
    } catch {
      if (!isIpingKillSwitchError(safe.code))
        resolutionErrorCode = "source_refresh_failed";
    }
    reportIpingIncident(client, safe.code);
    let resolution: unknown;
    let resolutionFailed = false;
    try {
      const outcome = await client.rpc("resolve_iping_refresh_job", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_refresh_id: null,
        p_error_code: resolutionErrorCode,
        p_retry_after_ms: safe.retryAfterMs ?? null,
      });
      resolution = outcome.data;
      resolutionFailed = Boolean(outcome.error);
    } catch {
      resolutionFailed = true;
    }
    if (resolutionFailed || !isRecord(resolution)) {
      counters.failed = 1;
      return { counters, status: 500 };
    }
    if (resolution.status === "retry_scheduled") {
      counters.retried = 1;
      return { counters, status: 200 };
    }
    counters.failed = 1;
    return { counters, status: 500 };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const workerAuthorized = await hasValidWorkerAuthorization(
    request,
    Deno.env.get("REFRESH_WORKER_TOKEN"),
  );
  const browserAuthorized = hasValidPublishableApiKey(request, {
    publishableKeys: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    publishableKey: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    legacyAnonKey: Deno.env.get("SUPABASE_ANON_KEY"),
  });
  if (!workerAuthorized && !browserAuthorized)
    return json({ error: "unauthorized" }, 401);
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return json({ error: "invalid_request", message: "invalid_json" }, 400);
  }
  if (workerAuthorized) {
    if (!isIpingWorkerInput(requestBody))
      return json({ ...emptyWorkerCounters(), failed: 1 }, 400);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey)
      return json({ ...emptyWorkerCounters(), failed: 1 }, 503);
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    try {
      if (requestBody.mode === "recover-iping") {
        if (!hasIpingRecoveryRuntime())
          return json({ ...emptyWorkerCounters(), failed: 1 }, 503);
        const { data: source, error: sourceError } = await client
          .from("sources")
          .select("enabled")
          .eq("code", "iping")
          .maybeSingle();
        if (sourceError || !source?.enabled)
          return json({ ...emptyWorkerCounters(), failed: 1 }, 503);
        const { data: recovery, error: recoveryError } = await client.rpc(
          "recover_iping_refresh_job",
        );
        if (recoveryError || !isRecord(recovery))
          return json({ ...emptyWorkerCounters(), failed: 1 }, 500);
        if (recovery.status === "busy" || recovery.status === "reset_only")
          return json({ ...emptyWorkerCounters(), skipped: 1 }, 409);
        if (
          recovery.status !== "requeued" &&
          recovery.status !== "already_pending"
        )
          return json({ ...emptyWorkerCounters(), failed: 1 }, 500);
      }
      const outcome = await drainOneIpingJob(client);
      if (
        requestBody.mode === "recover-iping" &&
        outcome.counters.succeeded !== 1
      )
        return json(
          outcome.counters,
          outcome.status >= 400 ? outcome.status : 503,
        );
      return json(outcome.counters, outcome.status);
    } catch {
      return json({ ...emptyWorkerCounters(), failed: 1 }, 500);
    }
  }
  try {
    if (isRecord(requestBody) && "mode" in requestBody)
      throw new Error("invalid_mode");
    const input = parseInput(requestBody);
    const normalizedName = normalizeName(input.name);
    const selected = input.sourceCodes ?? [
      "mock",
      "astree",
      "ttadivision",
      "mytt",
      "superstar",
    ];
    const results: Array<Record<string, unknown>> = [];
    let refreshId: number | string = crypto.randomUUID();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey)
      return json({ error: "server_not_configured" }, 503);
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    for (const sourceCode of selected) {
      if (sourceCode === "mock") {
        results.push({
          sourceCode,
          status: "succeeded",
          inserted: 0,
          updated: 0,
          unchanged: 0,
          synthetic: true,
        });
        continue;
      }
      if (sourceCode === "band") {
        results.push({ sourceCode, status: "skipped", reason: "manual_only" });
        continue;
      }
      const liveSourceCode = sourceCode as LiveSourceCode;
      const sourceFlag = sourceFlags[liveSourceCode];
      if (
        Deno.env.get("CRAWL_LIVE") !== "true" ||
        Deno.env.get(sourceFlag) !== "true"
      ) {
        results.push({
          sourceCode,
          status: "skipped",
          reason: "source_disabled",
        });
        continue;
      }
      const { data: source } = await client
        .from("sources")
        .select("id,enabled,parser_version")
        .eq("code", sourceCode)
        .maybeSingle();
      if (!source?.enabled) {
        results.push({
          sourceCode,
          status: "skipped",
          reason: "source_disabled",
        });
        continue;
      }
      if (!input.force || sourceCode === "iping") {
        const { data: fresh, error: freshError } = await client
          .from("source_refreshes")
          .select(
            "id,completed_at,records_inserted,records_updated,records_unchanged",
          )
          .eq("source_id", source.id)
          .eq("query_key", normalizedName)
          .eq("status", "succeeded")
          .gte(
            "completed_at",
            new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          )
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (freshError) {
          results.push({
            sourceCode,
            status: "failed",
            errorCode: "source_refresh_failed",
            message: "기존 조회 기록을 확인하지 못했습니다.",
          });
          continue;
        }
        if (fresh) {
          refreshId = fresh.id;
          results.push({
            sourceCode,
            status: "skipped",
            reason: "fresh",
            inserted: fresh.records_inserted,
            updated: fresh.records_updated,
            unchanged: fresh.records_unchanged,
          });
          continue;
        }
      }
      if (sourceCode === "iping") {
        if (!isSafeIpingPlayerName(input.name)) {
          results.push({
            sourceCode,
            status: "skipped",
            reason: "invalid_name",
            message: "아이핑 수집은 선수 이름 형식만 예약할 수 있습니다.",
          });
          continue;
        }
        const requestOriginHash = await hashRequestOrigin(
          request,
          serviceRoleKey,
        );
        const { data: queued, error: queueError } = await client.rpc(
          "enqueue_iping_refresh_job",
          {
            p_query_name: input.name,
            p_query_key: normalizedName,
            p_scope_hash: requestOriginHash,
          },
        );
        if (queueError || !isRecord(queued)) {
          results.push({
            sourceCode,
            status: "failed",
            errorCode: "source_refresh_failed",
            message: "아이핑 기록 수집을 예약하지 못했습니다.",
          });
          continue;
        }
        if (queued.status === "queued") {
          const jobId = queued.jobId;
          if (typeof jobId === "number" || typeof jobId === "string")
            refreshId = `job:${jobId}`;
          results.push({
            sourceCode,
            status: "queued",
            reason: "queued",
            message: "아이핑 최신 기록 수집을 예약했습니다.",
          });
        } else if (queued.status === "fresh") {
          if (
            typeof queued.refreshId === "number" ||
            typeof queued.refreshId === "string"
          )
            refreshId = queued.refreshId;
          results.push({ sourceCode, status: "skipped", reason: "fresh" });
        } else if (queued.status === "source_disabled") {
          results.push({
            sourceCode,
            status: "skipped",
            reason: "source_disabled",
          });
        } else if (queued.status === "source_unavailable") {
          const retryAfterMs = Number(queued.retryAfterMs);
          results.push({
            sourceCode,
            status: "failed",
            errorCode: "source_circuit_open",
            message: "반복된 인증 오류로 아이핑 수집을 잠시 보호합니다.",
            ...(Number.isFinite(retryAfterMs)
              ? {
                  retryAfterMs: Math.min(
                    6 * 60 * 60 * 1000,
                    Math.max(1, Math.ceil(retryAfterMs)),
                  ),
                }
              : {}),
          });
        } else if (queued.status === "cooldown") {
          const retryAfterMs = Number(queued.retryAfterMs);
          results.push({
            sourceCode,
            status: "skipped",
            reason: "source_cooldown",
            message: "최근 아이핑 수집이 종료되어 다음 예약까지 기다립니다.",
            ...(Number.isFinite(retryAfterMs)
              ? {
                  retryAfterMs: Math.min(
                    6 * 60 * 60 * 1000,
                    Math.max(1, Math.ceil(retryAfterMs)),
                  ),
                }
              : {}),
          });
        } else if (
          queued.status === "queue_full" ||
          queued.status === "origin_limited"
        ) {
          const retryAfterMs = Number(queued.retryAfterMs);
          results.push({
            sourceCode,
            status: "skipped",
            reason: "source_rate_limited",
            message:
              queued.status === "origin_limited"
                ? "아이핑 수집 예약 요청이 잠시 제한됐습니다."
                : "아이핑 수집 대기열이 가득 찼습니다.",
            ...(Number.isFinite(retryAfterMs)
              ? {
                  retryAfterMs: Math.min(
                    queued.status === "origin_limited"
                      ? 10 * 60 * 1000
                      : 60 * 1000,
                    Math.max(1, Math.ceil(retryAfterMs)),
                  ),
                }
              : {}),
          });
        } else {
          results.push({
            sourceCode,
            status: "failed",
            errorCode: "source_refresh_failed",
            message: "아이핑 기록 수집 상태를 확인하지 못했습니다.",
          });
        }
        continue;
      }
      const configuredMinimumIntervalMs = Number(
        Deno.env.get("CRAWLER_SOURCE_MIN_INTERVAL_MS") ?? 5000,
      );
      const minimumIntervalMs = Number.isFinite(configuredMinimumIntervalMs)
        ? Math.min(60_000, Math.max(5000, configuredMinimumIntervalMs))
        : 5000;
      const { data: claim, error: claimError } = await client.rpc(
        "claim_source_request_with_policy",
        {
          p_source_code: sourceCode,
          p_query_key: normalizedName,
          p_min_interval_ms: minimumIntervalMs,
        },
      );
      if (claimError) {
        results.push({
          sourceCode,
          status: "failed",
          errorCode: "source_refresh_failed",
          message: "출처 기록을 갱신하지 못했습니다.",
        });
        continue;
      }
      const retryDelay = isRecord(claim) ? Number(claim.retryAfterMs) : NaN;
      const claimReason = isRecord(claim) ? claim.reason : undefined;
      if (!Number.isFinite(retryDelay) || typeof claimReason !== "string") {
        results.push({
          sourceCode,
          status: "failed",
          errorCode: "source_refresh_failed",
          message: "출처 호출 제한 상태를 확인하지 못했습니다.",
        });
        continue;
      }
      if (claimReason === "source_circuit_open") {
        results.push({
          sourceCode,
          status: "failed",
          errorCode: "source_circuit_open",
          message: "반복된 인증 오류로 아이핑 조회를 잠시 보호합니다.",
          retryAfterMs: Math.min(600_000, Math.max(1, Math.ceil(retryDelay))),
        });
        continue;
      }
      if (retryDelay > 0) {
        results.push({
          sourceCode,
          status: "skipped",
          reason: "source_rate_limited",
          retryAfterMs: Math.min(60000, Math.max(1, Math.ceil(retryDelay))),
        });
        continue;
      }
      const requestStartedAt = Date.now();
      let diagnosticPhase: SourceDiagnosticPhase = "fetch";
      try {
        const fetchedAt = new Date().toISOString();
        const records: Array<Record<string, unknown>> = [];
        if (sourceCode === "astree" || sourceCode === "newttplay") {
          records.push(
            ...(await fetchMemberSearchRecords(
              sourceCode,
              input.name,
              fetchedAt,
            )),
          );
        } else if (sourceCode === "ttadivision") {
          records.push(
            ...(await fetchTtaDivisionRecords(input.name, fetchedAt)),
          );
        } else if (sourceCode === "mytt") {
          records.push(
            ...(await fetchMyttRecords(input.name, input.club, fetchedAt)),
          );
        } else if (sourceCode === "superstar") {
          records.push(...(await fetchSuperstarRecords(input.name, fetchedAt)));
        } else if (sourceCode === "yongintt") {
          records.push(
            ...(await fetchYonginCafeRecords(input.name, fetchedAt)),
          );
        } else {
          records.push(
            ...(await fetchSimpleHtmlRecords(
              sourceCode,
              input.name,
              fetchedAt,
            )),
          );
        }
        const unique = [
          ...new Map(
            records.map((record) => [String(record.naturalKeyHash), record]),
          ).values(),
        ];
        const parserVersion = parserVersions[liveSourceCode];
        diagnosticPhase = "persist";
        const { data: summary, error } = await client.rpc(
          "upsert_source_records_with_regions",
          {
            p_source_code: sourceCode,
            p_query_name: input.name,
            p_query_key: normalizedName,
            p_records: unique,
            p_parser_version: parserVersion,
          },
        );
        if (error || !isRecord(summary))
          throw new SafeSourceError(
            "source_persist_failed",
            "정규화한 출처 기록을 저장하지 못했습니다.",
          );
        refreshId = Number(summary.refreshId);
        diagnosticPhase = "complete";
        const { error: outcomeError } = await client.rpc(
          "record_source_request_outcome",
          {
            p_source_code: sourceCode,
            p_error_code: null,
            p_phase: diagnosticPhase,
            p_duration_ms: Date.now() - requestStartedAt,
          },
        );
        if (outcomeError)
          throw new SafeSourceError(
            "source_refresh_failed",
            "출처 보호 상태를 기록하지 못했습니다.",
          );
        results.push({
          sourceCode,
          status: "succeeded",
          inserted: Number(summary.inserted ?? 0),
          updated: Number(summary.updated ?? 0),
          unchanged: Number(summary.unchanged ?? 0),
          found: Number(summary.found ?? unique.length),
        });
      } catch (error) {
        const requestDurationMs = Date.now() - requestStartedAt;
        const mapped = publicSourceError(error);
        const safe =
          sourceCode === "airping" && mapped.code === "source_timeout"
            ? {
                ...mapped,
                message: "에어핑퐁 응답 시간이 초과되었습니다.",
                retryAfterMs: airpingRetryAfterMs,
              }
            : mapped;
        try {
          await client.rpc("record_source_refresh_failure", {
            p_source_code: sourceCode,
            p_error_code: safe.code,
          });
        } catch {
          // Diagnostics must never replace the original safe source response.
        }
        const { error: outcomeError } = await client.rpc(
          "record_source_request_outcome",
          {
            p_source_code: sourceCode,
            p_error_code: safe.code,
            p_phase: diagnosticPhase,
            p_duration_ms: requestDurationMs,
          },
        );
        if (outcomeError) {
          results.push({
            sourceCode,
            status: "failed",
            errorCode: "source_refresh_failed",
            message: "출처 보호 상태를 기록하지 못했습니다.",
          });
          continue;
        }
        if (
          safe.code === "source_schema_changed" ||
          safe.code === "source_auth_failed"
        ) {
          const parserVersion = parserVersions[liveSourceCode];
          scheduleBackground(
            reportOperationalIncident(
              {
                eventId: crypto.randomUUID(),
                category: safe.code,
                appVersion: "unknown",
                sourceCode,
                parserVersion,
              },
              {
                rpc: async (name, parameters) => {
                  const { data, error } = await client.rpc(name, parameters);
                  return {
                    data,
                    ...(error ? { error: { message: error.message } } : {}),
                  };
                },
                fetch,
                githubRepository: Deno.env.get("GITHUB_ISSUES_REPOSITORY"),
                githubToken: Deno.env.get("GITHUB_ISSUES_TOKEN"),
              },
            ),
          );
        }
        results.push({
          sourceCode,
          status: "failed",
          errorCode: safe.code,
          message: safe.message,
          ...(safe.retryAfterMs !== undefined
            ? { retryAfterMs: safe.retryAfterMs }
            : {}),
        });
      }
    }
    return json({
      query: { name: input.name, normalizedName },
      refreshId,
      sources: results,
    });
  } catch (error) {
    return json(
      {
        error: "invalid_request",
        message: error instanceof Error ? error.message : "invalid_request",
      },
      400,
    );
  }
});
