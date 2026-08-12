import { createClient } from 'npm:@supabase/supabase-js@2';
import iconv from 'npm:iconv-lite@0.7.0';
import { parseAirpingSearchHtml, parseAstreeSearchHtml, parseIpingSearchHtml, parseMyttSearchForm, parseMyttSearchHtml, parseOkPingpongSearchHtml, parseSuperstarSearchHtml, parseTtaDivisionSearchResponse, parseYonginCafeSearchResponse } from '../_shared/generated/astree-parser.js';
import { hasValidPublishableApiKey } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { isRecord, normalizeName } from '../_shared/normalize.ts';
import { ttaDivisionCa } from '../_shared/tta-ca.ts';

const sourceCodes = ['mock', 'airping', 'astree', 'ttadivision', 'okpingpong', 'mytt', 'superstar', 'yongintt', 'iping', 'band'] as const;
type SourceCode = typeof sourceCodes[number];
type LiveSourceCode = Exclude<SourceCode, 'mock' | 'band'>;
interface RefreshInput { name: string; club?: string; region?: string; sourceCodes?: SourceCode[]; force: boolean; }

class SafeSourceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

const sourceFlags: Record<LiveSourceCode, string> = {
  airping: 'CRAWLER_SOURCE_AIRPING_ENABLED',
  astree: 'CRAWLER_SOURCE_ASTREE_ENABLED',
  ttadivision: 'CRAWLER_SOURCE_TTADIVISION_ENABLED',
  okpingpong: 'CRAWLER_SOURCE_OKPINGPONG_ENABLED',
  mytt: 'CRAWLER_SOURCE_MYTT_ENABLED',
  superstar: 'CRAWLER_SOURCE_SUPERSTAR_ENABLED',
  yongintt: 'CRAWLER_SOURCE_YONGINTT_ENABLED',
  iping: 'CRAWLER_SOURCE_IPING_ENABLED',
};

const parserVersions: Record<LiveSourceCode, string> = {
  airping: 'airping-2',
  astree: 'astree-4',
  ttadivision: 'ttadivision-1',
  okpingpong: 'okpingpong-2',
  mytt: 'mytt-2',
  superstar: 'superstar-1',
  yongintt: 'yongintt-1',
  iping: 'iping-1',
};

function parseInput(value: unknown): RefreshInput {
  if (!isRecord(value) || typeof value.name !== 'string' || value.name.trim().length < 2 || value.name.length > 50) throw new Error('invalid_name');
  if (value.force !== undefined && typeof value.force !== 'boolean') throw new Error('invalid_force');
  const requested = value.sourceCodes;
  if (requested !== undefined && (!Array.isArray(requested) || requested.some((code) => typeof code !== 'string' || !sourceCodes.includes(code as SourceCode)))) throw new Error('invalid_source_codes');
  return { name: value.name.trim(), ...(typeof value.club === 'string' ? { club: value.club.trim() } : {}), ...(typeof value.region === 'string' ? { region: value.region.trim() } : {}), ...(requested ? { sourceCodes: requested as SourceCode[] } : {}), force: value.force === true };
}

function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof SafeSourceError) return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : '';
  if (error instanceof DOMException && error.name === 'TimeoutError') return { code: 'source_timeout', message: '출처 조회 시간이 초과되었습니다.' };
  if (message.includes('구조') || message.includes('식별자') || message.includes('열 개수')) return { code: 'source_schema_changed', message: '출처 페이지 구조 점검이 필요합니다.' };
  if (message.includes('HTTP 403')) return { code: 'source_blocked', message: '출처 접근이 차단되었습니다.' };
  if (message.includes('HTTP 429')) return { code: 'source_rate_limited', message: '출처 요청 제한에 도달했습니다.' };
  return { code: 'source_refresh_failed', message: '출처 기록을 갱신하지 못했습니다.' };
}

async function fetchTtaDivisionRecords(name: string, fetchedAt: string): Promise<Array<Record<string, unknown>>> {
  const userAgent = Deno.env.get('CRAWLER_USER_AGENT') ?? 'BUSU/0.1';
  const client = Deno.createHttpClient({ caCerts: [ttaDivisionCa] });
  try {
    const pageResponse = await fetch('https://ttadivision.sports.or.kr/statistic/moveSearchOteamPlayer.do', {
      client, signal: AbortSignal.timeout(8000), headers: { accept: 'text/html', 'user-agent': userAgent }, redirect: 'follow',
    });
    if (!pageResponse.ok) throw new Error(`HTTP ${pageResponse.status}`);
    const html = await pageResponse.text();
    const csrfToken = /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/iu.exec(html)?.[1];
    const cookie = pageResponse.headers.get('set-cookie')?.split(';', 1)[0];
    if (!csrfToken || !cookie || !html.includes('searchOteamPlayer.js')) throw new Error('대한탁구협회 디비전 검색 식별자 변경');
    const body = new URLSearchParams({ sigunguCd: 'ALL', selectSize: '100', nameSolt: '1', searchScrGbn: 'PP', ttStart: '0', ttEnd: '9999', searchValue: name, memberNm: name, pageIndex: '1' });
    const response = await fetch('https://ttadivision.sports.or.kr/statistic/selectSearchOteamPlyrList.do', {
      client, method: 'POST', signal: AbortSignal.timeout(8000), redirect: 'follow', body,
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded; charset=utf-8', cookie, 'x-csrf-token': csrfToken, 'user-agent': userAgent },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseTtaDivisionSearchResponse(await response.json(), name, fetchedAt) as Array<Record<string, unknown>>;
  } finally {
    client.close();
  }
}

function assertPublicHtmlResponse(response: Response, sourceName: string): void {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('text/html')) throw new Error(`${sourceName} 검색 구조 변경`);
}

async function readHtmlAllowingEarlyClose(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
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

async function fetchSimpleHtmlRecords(sourceCode: 'airping' | 'okpingpong', name: string, fetchedAt: string): Promise<Array<Record<string, unknown>>> {
  const userAgent = Deno.env.get('CRAWLER_USER_AGENT') ?? 'BUSU/0.1';
  const url = sourceCode === 'airping'
    ? new URL('https://airping.co.kr/11player/01.php')
    : new URL('http://okpingpong.co.kr/04match/08.php');
  url.searchParams.set('key', sourceCode === 'airping' ? 'r_name' : 'name');
  url.searchParams.set('keyword', name);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'text/html', 'user-agent': userAgent }, redirect: 'follow' });
  assertPublicHtmlResponse(response, sourceCode);
  const html = await response.text();
  return (sourceCode === 'airping'
    ? parseAirpingSearchHtml(html, name, fetchedAt)
    : parseOkPingpongSearchHtml(html, name, fetchedAt)) as Array<Record<string, unknown>>;
}

async function fetchSuperstarRecords(name: string, fetchedAt: string): Promise<Array<Record<string, unknown>>> {
  const url = new URL('https://www.superstar.kr/open/Do.jsp');
  url.searchParams.set('urlSeq', '302');
  url.searchParams.set('userNm', name);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: 'text/html', 'user-agent': Deno.env.get('CRAWLER_USER_AGENT') ?? 'BUSU/0.1' },
    redirect: 'follow',
  });
  assertPublicHtmlResponse(response, '슈퍼스타탁구');
  return parseSuperstarSearchHtml(await response.text(), name, fetchedAt) as Array<Record<string, unknown>>;
}

async function fetchYonginCafeRecords(name: string, fetchedAt: string): Promise<Array<Record<string, unknown>>> {
  const apiKey = Deno.env.get('KAKAO_REST_API_KEY');
  if (!apiKey) throw new SafeSourceError('source_not_configured', '카카오 REST API 키가 설정되지 않았습니다.');
  const url = new URL('https://dapi.kakao.com/v2/search/cafe');
  url.searchParams.set('query', `${name} 대회`);
  url.searchParams.set('sort', 'recency');
  url.searchParams.set('page', '1');
  url.searchParams.set('size', '50');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: 'application/json', authorization: `KakaoAK ${apiKey}`, 'user-agent': Deno.env.get('CRAWLER_USER_AGENT') ?? 'BUSU/0.1' },
  });
  if (response.status === 401 || response.status === 403) throw new SafeSourceError('source_auth_failed', '카카오 REST API 인증을 확인해 주세요.');
  if (response.status === 429) throw new SafeSourceError('source_rate_limited', '카카오 무료 검색 쿼터 또는 요청 제한에 도달했습니다.');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('application/json')) throw new Error('카카오 카페 검색 구조 변경');
  const parsed = parseYonginCafeSearchResponse(await response.json(), name, fetchedAt) as { records: Array<Record<string, unknown>> };
  return parsed.records;
}

const ipingBaseUrl = 'https://www.iping.club/';
const ipingUnescapedByte = /^[A-Za-z0-9_.~-]$/u;

function encodeIpingComponent(value: string): string {
  return [...iconv.encode(value, 'cp949')]
    .map((byte) => {
      const character = String.fromCharCode(byte);
      return ipingUnescapedByte.test(character) ? character : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

function encodeIpingForm(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields).map(([key, value]) => `${encodeIpingComponent(key)}=${encodeIpingComponent(value)}`).join('&');
}

function ipingCookie(response: Response): string | undefined {
  return response.headers.get('set-cookie')?.split(';', 1)[0];
}

async function decodeIpingResponse(response: Response): Promise<string> {
  return iconv.decode(new Uint8Array(await response.arrayBuffer()), 'cp949');
}

function assertIpingHtmlResponse(response: Response, label: string): void {
  if (response.status === 403) throw new SafeSourceError('source_blocked', '아이핑 접근이 차단되었습니다.');
  if (response.status === 429) throw new SafeSourceError('source_rate_limited', '아이핑 요청 제한에 도달했습니다.');
  if (!response.ok) throw new Error(`아이핑 ${label} HTTP ${response.status}`);
  if (!(response.headers.get('content-type') ?? '').toLocaleLowerCase().includes('text/html')) throw new Error(`아이핑 ${label} 검색 구조 변경`);
}

async function fetchIpingRecords(name: string, fetchedAt: string): Promise<Array<Record<string, unknown>>> {
  const username = Deno.env.get('IPING_USERNAME');
  const password = Deno.env.get('IPING_PASSWORD');
  if (!username || !password) throw new SafeSourceError('source_not_configured', '아이핑 전용 계정 Secret이 설정되지 않았습니다.');
  const userAgent = Deno.env.get('CRAWLER_USER_AGENT') ?? 'BUSU/0.1';
  const baseHeaders = { accept: 'text/html', 'accept-encoding': 'identity', 'user-agent': userAgent };
  const loginUrl = `${ipingBaseUrl}?pg=login`;
  const loginPage = await fetch(loginUrl, { signal: AbortSignal.timeout(8000), headers: baseHeaders, redirect: 'manual' });
  assertIpingHtmlResponse(loginPage, '로그인 화면');
  const initialCookie = ipingCookie(loginPage);
  if (!initialCookie) throw new SafeSourceError('source_schema_changed', '아이핑 로그인 세션 구조 점검이 필요합니다.');
  const loginResponse = await fetch(loginUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    redirect: 'manual',
    body: encodeIpingForm({ path: '', pg: 'login', Mid: username, Pwd: password }),
    headers: { ...baseHeaders, cookie: initialCookie, referer: loginUrl, 'content-type': 'application/x-www-form-urlencoded; charset=euc-kr' },
  });
  if (loginResponse.status === 403) throw new SafeSourceError('source_blocked', '아이핑 접근이 차단되었습니다.');
  if (loginResponse.status === 429) throw new SafeSourceError('source_rate_limited', '아이핑 요청 제한에 도달했습니다.');
  if (loginResponse.status >= 400) throw new Error(`아이핑 로그인 HTTP ${loginResponse.status}`);
  const sessionCookie = ipingCookie(loginResponse) ?? initialCookie;
  const destination = new URL(
    loginResponse.status >= 300 && loginResponse.status < 400 ? loginResponse.headers.get('location') ?? '/' : '/',
    ipingBaseUrl,
  ).toString();
  const verificationResponse = await fetch(destination, { signal: AbortSignal.timeout(8000), headers: { ...baseHeaders, cookie: sessionCookie, referer: loginUrl }, redirect: 'follow' });
  assertIpingHtmlResponse(verificationResponse, '로그인 확인');
  const verificationHtml = await decodeIpingResponse(verificationResponse);
  if (/자동등록방지|Please prove that you are human/iu.test(verificationHtml)) throw new SafeSourceError('source_blocked', '아이핑 사람 확인 절차가 필요합니다.');
  if (!verificationHtml.includes('mb_logout.php')) throw new SafeSourceError('source_auth_failed', '아이핑 계정 인증에 실패했습니다.');

  const search = async (suffix: string): Promise<string> => {
    const query = encodeIpingForm({ pg: 'Search', SchVal: name });
    const response = await fetch(`${ipingBaseUrl}?${query}${suffix}`, {
      signal: AbortSignal.timeout(8000),
      headers: { ...baseHeaders, cookie: sessionCookie, referer: `${ipingBaseUrl}?pg=Search` },
      redirect: 'follow',
    });
    assertIpingHtmlResponse(response, '선수 검색');
    const html = await decodeIpingResponse(response);
    if (/자동등록방지|Please prove that you are human/iu.test(html)) throw new SafeSourceError('source_blocked', '아이핑 사람 확인 절차가 필요합니다.');
    if (html.includes('name="Mid"') && html.includes('name="Pwd"')) throw new SafeSourceError('source_auth_failed', '아이핑 인증 세션이 만료되었습니다.');
    return html;
  };
  const [entriesHtml, nationwideAwardsHtml, districtAwardsHtml] = await Promise.all([search('&B=Y'), search('&Ctype=A'), search('&Ctype=B')]);
  return [
    ...(parseIpingSearchHtml(entriesHtml, name, fetchedAt, 'entry') as Array<Record<string, unknown>>),
    ...(parseIpingSearchHtml(nationwideAwardsHtml, name, fetchedAt, 'award') as Array<Record<string, unknown>>),
    ...(parseIpingSearchHtml(districtAwardsHtml, name, fetchedAt, 'award') as Array<Record<string, unknown>>),
  ];
}

async function fetchMyttRecords(name: string, club: string | undefined, fetchedAt: string): Promise<Array<Record<string, unknown>>> {
  const url = 'https://mytt.kr/main/player_list.xhtml';
  const userAgent = Deno.env.get('CRAWLER_USER_AGENT') ?? 'BUSU/0.1';
  const headers = { accept: 'text/html', 'accept-encoding': 'identity', 'user-agent': userAgent };
  const client = Deno.createHttpClient({ caCerts: [ttaDivisionCa] });
  try {
    let pageResponse: Response;
    try {
      pageResponse = await fetch(url, { client, signal: AbortSignal.timeout(8000), headers, redirect: 'follow' });
    } catch {
      throw new SafeSourceError('source_request_failed', '마이티티 공개 검색 form에 연결하지 못했습니다.');
    }
    assertPublicHtmlResponse(pageResponse, '마이티티');
    const pageHtml = await pageResponse.text();
    let form: { viewState: string; submitButton: string };
    try {
      form = parseMyttSearchForm(pageHtml);
    } catch {
      throw new SafeSourceError('source_schema_changed', '마이티티 검색 form 구조 점검이 필요합니다.');
    }
    const cookie = pageResponse.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new SafeSourceError('source_schema_changed', '마이티티 검색 세션 구조 점검이 필요합니다.');
    const body = new URLSearchParams({
      mainForm: 'mainForm',
      'mainForm:playerName': name,
      'mainForm:clubName': club ?? '',
      'mainForm:contestName': '',
      'mainForm:scale_input': '',
      [form.submitButton]: form.submitButton,
      'javax.faces.ViewState': form.viewState,
    });
    let response: Response;
    try {
      response = await fetch(url, {
        client, method: 'POST', signal: AbortSignal.timeout(8000), redirect: 'follow', body,
        headers: { ...headers, cookie, 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      });
    } catch {
      throw new SafeSourceError('source_request_failed', '마이티티 공개 검색 요청을 완료하지 못했습니다.');
    }
    assertPublicHtmlResponse(response, '마이티티');
    try {
      return parseMyttSearchHtml(await readHtmlAllowingEarlyClose(response), name, fetchedAt) as Array<Record<string, unknown>>;
    } catch {
      throw new SafeSourceError('source_schema_changed', '마이티티 검색 결과 구조 점검이 필요합니다.');
    }
  } finally {
    client.close();
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!hasValidPublishableApiKey(request, {
    publishableKeys: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
    publishableKey: Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    legacyAnonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  })) return json({ error: 'unauthorized' }, 401);
  try {
    const input = parseInput(await request.json());
    const normalizedName = normalizeName(input.name);
    const selected = input.sourceCodes ?? ['mock', 'astree', 'ttadivision', 'mytt', 'superstar'];
    const results: Array<Record<string, unknown>> = [];
    let refreshId: number | string = crypto.randomUUID();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'server_not_configured' }, 503);
    const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    for (const sourceCode of selected) {
      if (sourceCode === 'mock') {
        results.push({ sourceCode, status: 'succeeded', inserted: 0, updated: 0, unchanged: 0, synthetic: true });
        continue;
      }
      if (sourceCode === 'band') {
        results.push({ sourceCode, status: 'skipped', reason: 'manual_only' });
        continue;
      }
      const liveSourceCode = sourceCode as LiveSourceCode;
      const sourceFlag = sourceFlags[liveSourceCode];
      if (Deno.env.get('CRAWL_LIVE') !== 'true' || Deno.env.get(sourceFlag) !== 'true') {
        results.push({ sourceCode, status: 'skipped', reason: 'source_disabled' });
        continue;
      }
      const { data: source } = await client.from('sources').select('id,enabled,parser_version').eq('code', sourceCode).maybeSingle();
      if (!source?.enabled) { results.push({ sourceCode, status: 'skipped', reason: 'source_disabled' }); continue; }
      if (!input.force) {
        const { data: fresh } = await client.from('source_refreshes').select('id,completed_at,records_inserted,records_updated,records_unchanged').eq('source_id', source.id).eq('query_key', normalizedName).eq('status', 'succeeded').gte('completed_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()).order('requested_at', { ascending: false }).limit(1).maybeSingle();
        if (fresh) { refreshId = fresh.id; results.push({ sourceCode, status: 'skipped', reason: 'fresh', inserted: fresh.records_inserted, updated: fresh.records_updated, unchanged: fresh.records_unchanged }); continue; }
      }
      const configuredMinimumIntervalMs = Number(Deno.env.get('CRAWLER_SOURCE_MIN_INTERVAL_MS') ?? 2000);
      const minimumIntervalMs = Number.isFinite(configuredMinimumIntervalMs) ? Math.max(1000, configuredMinimumIntervalMs) : 2000;
      const { data: claimedSource, error: claimError } = await client.rpc('claim_source_request', {
        p_source_code: sourceCode,
        p_min_interval_ms: minimumIntervalMs,
      });
      if (claimError) {
        results.push({ sourceCode, status: 'failed', errorCode: 'source_refresh_failed', message: '출처 기록을 갱신하지 못했습니다.' });
        continue;
      }
      if (claimedSource !== true) {
        results.push({ sourceCode, status: 'skipped', reason: 'source_rate_limited' });
        continue;
      }
      try {
        const fetchedAt = new Date().toISOString();
        const records: Array<Record<string, unknown>> = [];
        if (sourceCode === 'astree') {
          for (let page = 1; page <= 2; page += 1) {
            const url = new URL('https://astree.co.kr/bbs/board.php');
            url.searchParams.set('bo_table', 'member_search');
            url.searchParams.set('sfl', 'wr_subject');
            url.searchParams.set('stx', input.name);
            url.searchParams.set('page', String(page));
            const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'text/html', 'user-agent': Deno.env.get('CRAWLER_USER_AGENT') ?? 'BUSU/0.1' }, redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const parsed = parseAstreeSearchHtml(html, input.name, fetchedAt) as Array<Record<string, unknown>>;
            records.push(...parsed);
            if (parsed.length === 0 || !html.includes(`page=${page + 1}`)) break;
          }
        } else if (sourceCode === 'ttadivision') {
          records.push(...await fetchTtaDivisionRecords(input.name, fetchedAt));
        } else if (sourceCode === 'mytt') {
          records.push(...await fetchMyttRecords(input.name, input.club, fetchedAt));
        } else if (sourceCode === 'superstar') {
          records.push(...await fetchSuperstarRecords(input.name, fetchedAt));
        } else if (sourceCode === 'yongintt') {
          records.push(...await fetchYonginCafeRecords(input.name, fetchedAt));
        } else if (sourceCode === 'iping') {
          records.push(...await fetchIpingRecords(input.name, fetchedAt));
        } else {
          records.push(...await fetchSimpleHtmlRecords(sourceCode, input.name, fetchedAt));
        }
        const unique = [...new Map(records.map((record) => [String(record.naturalKeyHash), record])).values()];
        const parserVersion = parserVersions[liveSourceCode];
        const { data: summary, error } = await client.rpc('upsert_source_records_with_regions', { p_source_code: sourceCode, p_query_name: input.name, p_query_key: normalizedName, p_records: unique, p_parser_version: parserVersion });
        if (error || !isRecord(summary)) throw new SafeSourceError('source_persist_failed', '정규화한 출처 기록을 저장하지 못했습니다.');
        refreshId = Number(summary.refreshId);
        results.push({ sourceCode, status: 'succeeded', inserted: Number(summary.inserted ?? 0), updated: Number(summary.updated ?? 0), unchanged: Number(summary.unchanged ?? 0), found: Number(summary.found ?? unique.length) });
      } catch (error) {
        const safe = publicError(error);
        results.push({ sourceCode, status: 'failed', errorCode: safe.code, message: safe.message });
      }
    }
    return json({ query: { name: input.name, normalizedName }, refreshId, sources: results });
  } catch (error) {
    return json({ error: 'invalid_request', message: error instanceof Error ? error.message : 'invalid_request' }, 400);
  }
});
