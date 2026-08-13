import { stableHash } from "@busu/domain";
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
import { decodeIpingHtml, encodeIpingForm } from "./encoding";
import {
  IPING_BASE_URL,
  IPING_SEARCH_URL,
  parseIpingSearchHtml,
} from "./parser";
import { classifyIpingSessionHtml } from "./session";
import { fetchWithRetry } from "../resilient-fetch";

export interface IpingCredentials {
  username: string;
  password: string;
}

function responseCookie(response: Response): string | undefined {
  return response.headers.get("set-cookie")?.split(";", 1)[0];
}

function assertHtmlResponse(response: Response, label: string): void {
  if (response.status === 403) throw new SourceBlockedError();
  if (response.status === 429) throw new SourceRateLimitedError();
  if (!response.ok)
    throw new SourceParseError(`아이핑 ${label} HTTP ${response.status}`);
  if (
    !(response.headers.get("content-type") ?? "")
      .toLocaleLowerCase()
      .includes("text/html")
  ) {
    throw new SourceSchemaChangedError(
      "아이핑에서 HTML이 아닌 응답을 받았습니다.",
    );
  }
}

async function responseHtml(response: Response): Promise<string> {
  return decodeIpingHtml(new Uint8Array(await response.arrayBuffer()));
}

async function request(
  url: string,
  input: SourceSearchInput,
  context: SourceAdapterContext,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  try {
    const requestInit = {
      ...init,
      ...(input.signal ? { signal: input.signal } : {}),
      headers: {
        accept: "text/html",
        "accept-encoding": "identity",
        "user-agent": context.userAgent ?? "BUSU",
        ...init.headers,
      },
    } satisfies RequestInit;
    if (!retry) {
      const timeoutSignal = AbortSignal.timeout(
        Math.max(context.timeoutMs, 12_000),
      );
      return await fetch(url, {
        ...requestInit,
        signal: input.signal
          ? AbortSignal.any([input.signal, timeoutSignal])
          : timeoutSignal,
      });
    }
    return await fetchWithRetry(url, requestInit, {
      timeoutMs: Math.max(context.timeoutMs, 12_000),
      maxAttempts: 2,
      retryDelayMs: 250,
    });
  } catch (error) {
    if (
      input.signal?.aborted ||
      (error instanceof DOMException && error.name === "TimeoutError")
    )
      throw new SourceTimeoutError();
    throw new SourceParseError(
      error instanceof Error ? error.message : "아이핑 요청 실패",
    );
  }
}

async function createAuthenticatedSession(
  credentials: IpingCredentials,
  input: SourceSearchInput,
  context: SourceAdapterContext,
): Promise<string> {
  const loginUrl = `${IPING_BASE_URL}?pg=login`;
  const loginPage = await request(loginUrl, input, context, {
    redirect: "manual",
  });
  assertHtmlResponse(loginPage, "로그인 화면");
  const initialCookie = responseCookie(loginPage);
  if (!initialCookie)
    throw new SourceSchemaChangedError(
      "아이핑 로그인 세션 쿠키를 찾지 못했습니다.",
    );
  const body = encodeIpingForm({
    path: "",
    pg: "login",
    Mid: credentials.username,
    Pwd: credentials.password,
  });
  const loginResponse = await request(
    loginUrl,
    input,
    context,
    {
      method: "POST",
      redirect: "manual",
      body,
      headers: {
        cookie: initialCookie,
        referer: loginUrl,
        "content-type": "application/x-www-form-urlencoded; charset=euc-kr",
      },
    },
    false,
  );
  if (loginResponse.status === 403) throw new SourceBlockedError();
  if (loginResponse.status === 429) throw new SourceRateLimitedError();
  if (loginResponse.status >= 400)
    throw new SourceParseError(`아이핑 로그인 HTTP ${loginResponse.status}`);
  const sessionCookie = responseCookie(loginResponse) ?? initialCookie;
  let verificationResponse = loginResponse;
  if (loginResponse.status >= 300 && loginResponse.status < 400) {
    const destination = new URL(
      loginResponse.headers.get("location") ?? "/",
      IPING_BASE_URL,
    ).toString();
    verificationResponse = await request(destination, input, context, {
      headers: { cookie: sessionCookie, referer: loginUrl },
      redirect: "follow",
    });
  }
  assertHtmlResponse(verificationResponse, "로그인 확인");
  const verificationHtml = await responseHtml(verificationResponse);
  const sessionPage = classifyIpingSessionHtml(verificationHtml);
  if (sessionPage === "challenge")
    throw new SourceBlockedError("아이핑 사람 확인 절차가 필요합니다.");
  if (sessionPage === "guest")
    throw new SourceBlockedError("아이핑 계정 인증에 실패했습니다.");
  if (sessionPage !== "authenticated")
    throw new SourceSchemaChangedError(
      "아이핑 로그인 성공 화면 구조를 확인하지 못했습니다.",
    );
  return sessionCookie;
}

async function fetchSearchHtml(
  name: string,
  suffix: string,
  cookie: string,
  input: SourceSearchInput,
  context: SourceAdapterContext,
): Promise<string> {
  const query = encodeIpingForm({ pg: "Search", SchVal: name });
  const url = `${IPING_BASE_URL}?${query}${suffix}`;
  const response = await request(url, input, context, {
    headers: { cookie, referer: IPING_SEARCH_URL },
    redirect: "follow",
  });
  assertHtmlResponse(response, "선수 검색");
  const html = await responseHtml(response);
  const sessionPage = classifyIpingSessionHtml(html);
  if (sessionPage === "challenge")
    throw new SourceBlockedError("아이핑 사람 확인 절차가 필요합니다.");
  if (sessionPage === "guest")
    throw new SourceBlockedError("아이핑 인증 세션이 만료되었습니다.");
  return html;
}

export class IpingSourceAdapter implements SourceAdapter {
  readonly sourceCode = "iping";
  readonly mode = "http";
  readonly parserVersion = "iping-2";

  constructor(
    readonly enabled = false,
    private readonly credentials?: IpingCredentials,
  ) {}

  supportsLiveRefresh(): boolean {
    return this.enabled && this.credentials !== undefined;
  }

  async search(
    input: SourceSearchInput,
    context: SourceAdapterContext,
  ): Promise<SourceSearchResult> {
    if (!this.enabled || !input.live)
      throw new SourceDisabledError(
        "아이핑 live adapter가 비활성화되어 있습니다.",
      );
    if (!this.credentials?.username || !this.credentials.password)
      throw new SourceDisabledError(
        "아이핑 전용 계정 Secret이 설정되지 않았습니다.",
      );
    const cookie = await createAuthenticatedSession(
      this.credentials,
      input,
      context,
    );
    const [entriesHtml, nationwideAwardsHtml, districtAwardsHtml] =
      await Promise.all([
        fetchSearchHtml(input.name.trim(), "&B=Y", cookie, input, context),
        fetchSearchHtml(input.name.trim(), "&Ctype=A", cookie, input, context),
        fetchSearchHtml(input.name.trim(), "&Ctype=B", cookie, input, context),
      ]);
    const fetchedAt = context.now().toISOString();
    const records = [
      ...parseIpingSearchHtml(entriesHtml, input.name, fetchedAt, "entry"),
      ...parseIpingSearchHtml(
        nationwideAwardsHtml,
        input.name,
        fetchedAt,
        "award",
      ),
      ...parseIpingSearchHtml(
        districtAwardsHtml,
        input.name,
        fetchedAt,
        "award",
      ),
    ];
    const uniqueRecords = [
      ...new Map(
        records.map((record) => [record.naturalKeyHash, record]),
      ).values(),
    ];
    return {
      sourceCode: this.sourceCode,
      fetchedAt,
      sourceUrl: IPING_SEARCH_URL,
      records: uniqueRecords,
      warnings: ["인증 세션은 이번 조회에만 사용하며 저장하지 않습니다."],
      rawContentHash: stableHash(
        `${entriesHtml}\n${nationwideAwardsHtml}\n${districtAwardsHtml}`,
      ),
      parserVersion: this.parserVersion,
    };
  }
}
