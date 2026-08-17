import { pathToFileURL } from "node:url";

import { chromium, type Browser } from "@playwright/test";

import { encodeIpingForm } from "../packages/source-adapters/src/iping/encoding";
import {
  classifyIpingSessionHtml,
  IPING_BROWSER_USER_AGENT,
} from "../packages/source-adapters/src/iping/session";

const ipingBaseUrl = "https://www.iping.club/";
const ipingOrigin = new URL(ipingBaseUrl).origin;
const navigationTimeoutMs = 20_000;
const maximumHtmlBytes = 1_500_000;
const maximumPayloadBytes = 4_000_000;
const sessionSettleAttempts = 24;
const searchSettleAttempts = 10;
const sessionSettleIntervalMs = 500;

export const ipingBrowserContextOptions = {
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  userAgent: IPING_BROWSER_USER_AGENT,
} as const;

export type IpingBrowserWorkerMode = "drain-iping" | "recover-iping";

export type IpingBrowserPhase =
  | "login_page"
  | "login_submit"
  | "login_verify"
  | "entry_search"
  | "nationwide_awards_search"
  | "district_awards_search";

export type IpingBrowserFailureCode =
  | "source_timeout"
  | "source_request_failed"
  | "source_rate_limited"
  | "source_auth_failed"
  | "source_schema_changed"
  | "source_blocked"
  | "source_not_configured";

export interface IpingBrowserPages {
  entriesHtml: string;
  nationwideAwardsHtml: string;
  districtAwardsHtml: string;
}

export interface IpingBrowserCredentials {
  username: string;
  password: string;
}

export interface ClaimedIpingBrowserJob {
  id: number | string;
  name: string;
  leaseToken: string;
}

export type IpingBrowserClaim =
  | { status: "claimed"; job: ClaimedIpingBrowserJob }
  | {
      status:
        | "busy"
        | "empty"
        | "reset_only"
        | "skipped"
        | "source_disabled"
        | "source_unavailable";
    };

export interface IpingBrowserWorkerApi {
  claim(mode: IpingBrowserWorkerMode): Promise<IpingBrowserClaim>;
  complete(
    job: ClaimedIpingBrowserJob,
    pages: IpingBrowserPages,
    durationMs: number,
  ): Promise<"succeeded" | "failed" | "retry_scheduled" | "lease_lost">;
  fail(
    job: ClaimedIpingBrowserJob,
    failure: IpingBrowserFailure,
    durationMs: number,
  ): Promise<void>;
}

export interface IpingBrowserCollector {
  collect(
    name: string,
    credentials: IpingBrowserCredentials,
  ): Promise<IpingBrowserPages>;
}

export interface IpingBrowserFailure {
  code: IpingBrowserFailureCode;
  phase: IpingBrowserPhase;
  retryAfterMs?: number;
}

export interface IpingBrowserWorkerResult {
  status:
    | "busy"
    | "empty"
    | "reset_only"
    | "skipped"
    | "source_disabled"
    | "source_unavailable"
    | "succeeded";
}

export class IpingBrowserWorkerError extends Error {
  readonly failure: IpingBrowserFailure;
  readonly alreadyReported: boolean;

  constructor(
    failure: IpingBrowserFailure,
    options: { alreadyReported?: boolean } = {},
  ) {
    super(failure.code);
    this.name = "IpingBrowserWorkerError";
    this.failure = failure;
    this.alreadyReported = options.alreadyReported === true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJobId(value: unknown): value is number | string {
  return (
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === "string" && /^[1-9]\d{0,18}$/u.test(value))
  );
}

function isLeaseToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function asClaim(value: unknown): IpingBrowserClaim {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new IpingBrowserWorkerError({
      code: "source_request_failed",
      phase: "login_page",
    });
  }
  if (
    value.status === "busy" ||
    value.status === "empty" ||
    value.status === "reset_only" ||
    value.status === "skipped" ||
    value.status === "source_disabled" ||
    value.status === "source_unavailable"
  ) {
    return { status: value.status };
  }
  if (value.status !== "claimed" || !isRecord(value.job)) {
    throw new IpingBrowserWorkerError({
      code: "source_request_failed",
      phase: "login_page",
    });
  }
  const { id, name, leaseToken } = value.job;
  if (
    !isJobId(id) ||
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.length > 30 ||
    !isLeaseToken(leaseToken)
  ) {
    throw new IpingBrowserWorkerError({
      code: "source_request_failed",
      phase: "login_page",
    });
  }
  return { status: "claimed", job: { id, name, leaseToken } };
}

function asResolution(
  value: unknown,
): "succeeded" | "failed" | "retry_scheduled" | "lease_lost" {
  if (
    !isRecord(value) ||
    (value.status !== "succeeded" &&
      value.status !== "failed" &&
      value.status !== "retry_scheduled" &&
      value.status !== "lease_lost")
  ) {
    throw new IpingBrowserWorkerError({
      code: "source_request_failed",
      phase: "district_awards_search",
    });
  }
  return value.status;
}

class EdgeIpingBrowserWorkerApi implements IpingBrowserWorkerApi {
  constructor(
    private readonly endpoint: string,
    private readonly workerToken: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async post(body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(this.endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${this.workerToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new IpingBrowserWorkerError({
        code: "source_request_failed",
        phase: "login_page",
      });
    }
    if (!response.ok) {
      throw new IpingBrowserWorkerError({
        code: "source_request_failed",
        phase: "login_page",
      });
    }
    try {
      return await response.json();
    } catch {
      throw new IpingBrowserWorkerError({
        code: "source_request_failed",
        phase: "login_page",
      });
    }
  }

  async claim(mode: IpingBrowserWorkerMode): Promise<IpingBrowserClaim> {
    return asClaim(
      await this.post({
        mode:
          mode === "recover-iping"
            ? "recover-iping-browser"
            : "claim-iping-browser",
      }),
    );
  }

  async complete(
    job: ClaimedIpingBrowserJob,
    pages: IpingBrowserPages,
    durationMs: number,
  ): Promise<"succeeded" | "failed" | "retry_scheduled" | "lease_lost"> {
    return asResolution(
      await this.post({
        mode: "complete-iping-browser",
        jobId: job.id,
        leaseToken: job.leaseToken,
        durationMs,
        pages,
      }),
    );
  }

  async fail(
    job: ClaimedIpingBrowserJob,
    failure: IpingBrowserFailure,
    durationMs: number,
  ): Promise<void> {
    await this.post({
      mode: "fail-iping-browser",
      jobId: job.id,
      leaseToken: job.leaseToken,
      durationMs,
      errorCode: failure.code,
      phase: failure.phase,
      ...(failure.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: failure.retryAfterMs }),
    });
  }
}

function assertNavigationStatus(
  status: number | undefined,
  url: string | undefined,
  phase: IpingBrowserPhase,
): void {
  if (
    status === undefined ||
    url === undefined ||
    new URL(url).origin !== ipingOrigin
  ) {
    throw new IpingBrowserWorkerError({
      code: "source_request_failed",
      phase,
    });
  }
  if (status === 403) {
    throw new IpingBrowserWorkerError({ code: "source_blocked", phase });
  }
  if (status === 429) {
    throw new IpingBrowserWorkerError({
      code: "source_rate_limited",
      phase,
    });
  }
  if (status === 408 || status >= 500) {
    throw new IpingBrowserWorkerError({
      code: "source_request_failed",
      phase,
    });
  }
  if (status >= 400) {
    throw new IpingBrowserWorkerError({
      code: "source_schema_changed",
      phase,
    });
  }
}

function assertSession(
  html: string,
  phase: IpingBrowserPhase,
  requireAuthenticated: boolean,
): void {
  const state = classifyIpingSessionHtml(html);
  if (state === "challenge") {
    throw new IpingBrowserWorkerError({ code: "source_blocked", phase });
  }
  if (state === "guest") {
    throw new IpingBrowserWorkerError({ code: "source_auth_failed", phase });
  }
  if (requireAuthenticated && state !== "authenticated") {
    throw new IpingBrowserWorkerError({
      code: "source_schema_changed",
      phase,
    });
  }
}

function assertHtmlSize(html: string, phase: IpingBrowserPhase): void {
  if (
    html.length < 1 ||
    new TextEncoder().encode(html).byteLength > maximumHtmlBytes
  ) {
    throw new IpingBrowserWorkerError({
      code: "source_schema_changed",
      phase,
    });
  }
}

export function resolveIpingBrowserExecutable(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const executablePath = environment.IPING_BROWSER_EXECUTABLE?.trim();
  return executablePath || undefined;
}

async function launchChrome(): Promise<Browser> {
  const executablePath = resolveIpingBrowserExecutable();
  if (executablePath) {
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
        chromiumSandbox: false,
      });
    } catch {
      throw new IpingBrowserWorkerError({
        code: "source_not_configured",
        phase: "login_page",
      });
    }
  }
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    try {
      return await chromium.launch({ headless: true });
    } catch {
      throw new IpingBrowserWorkerError({
        code: "source_not_configured",
        phase: "login_page",
      });
    }
  }
}

export class PlaywrightIpingBrowserCollector implements IpingBrowserCollector {
  async collect(
    name: string,
    credentials: IpingBrowserCredentials,
  ): Promise<IpingBrowserPages> {
    const browser = await launchChrome();
    try {
      const context = await browser.newContext(ipingBrowserContextOptions);
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(navigationTimeoutMs);
      let credentialsRejected = false;
      page.on("dialog", (dialog) => {
        if (/등록되지 않은|비밀번호/u.test(dialog.message())) {
          credentialsRejected = true;
        }
        void dialog.dismiss().catch(() => undefined);
      });

      let phase: IpingBrowserPhase = "login_page";
      try {
        const loginResponse = await page.goto(`${ipingBaseUrl}?pg=login`, {
          waitUntil: "domcontentloaded",
        });
        assertNavigationStatus(
          loginResponse?.status(),
          loginResponse?.url(),
          phase,
        );
        const loginHtml = await page.content();
        assertHtmlSize(loginHtml, phase);
        if (classifyIpingSessionHtml(loginHtml) === "challenge") {
          throw new IpingBrowserWorkerError({
            code: "source_blocked",
            phase,
          });
        }
        const usernameInput = page.locator('input[name="Mid"]');
        const passwordInput = page.locator('input[name="Pwd"]');
        if (
          (await usernameInput.count()) !== 1 ||
          (await passwordInput.count()) !== 1
        ) {
          throw new IpingBrowserWorkerError({
            code: "source_schema_changed",
            phase,
          });
        }
        const loginForm = await passwordInput.evaluate((input) => ({
          action:
            input instanceof HTMLInputElement && input.form
              ? input.form.action
              : "",
          method:
            input instanceof HTMLInputElement && input.form
              ? input.form.method
              : "",
        }));
        if (
          !loginForm.action ||
          new URL(loginForm.action).origin !== ipingOrigin ||
          loginForm.method.toLocaleLowerCase() !== "post"
        ) {
          throw new IpingBrowserWorkerError({
            code: "source_schema_changed",
            phase,
          });
        }
        await usernameInput.fill(credentials.username);
        await passwordInput.fill(credentials.password);

        phase = "login_submit";
        const submitNavigation = page.waitForNavigation({
          waitUntil: "domcontentloaded",
        });
        const [, submitResponse] = await Promise.all([
          passwordInput.evaluate((input) => {
            if (!(input instanceof HTMLInputElement) || !input.form) {
              throw new Error("login_form_unavailable");
            }
            input.form.requestSubmit();
          }),
          submitNavigation,
        ]);
        assertNavigationStatus(
          submitResponse?.status(),
          submitResponse?.url(),
          phase,
        );

        phase = "login_verify";
        const verificationHtml = await settleIpingSessionHtml(page);
        if (credentialsRejected) {
          throw new IpingBrowserWorkerError({
            code: "source_auth_failed",
            phase,
          });
        }
        if (verificationHtml.length === 0) {
          throw new IpingBrowserWorkerError({
            code: "source_request_failed",
            phase,
          });
        }
        assertHtmlSize(verificationHtml, phase);
        assertSession(verificationHtml, phase, true);

        const search = async (
          suffix: string,
          searchPhase: IpingBrowserPhase,
        ): Promise<string> => {
          phase = searchPhase;
          const query = encodeIpingForm({ pg: "Search", SchVal: name });
          const searchUrl = `${ipingBaseUrl}?${query}${suffix}`;
          const response = await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
          });
          assertNavigationStatus(response?.status(), response?.url(), phase);
          const html = await settleIpingSearchHtml(page);
          assertHtmlSize(html, phase);
          // A query iPing refuses must not look like a source-wide outage.
          if (
            isIpingQueryRejectionHtml(html) ||
            !new URL(page.url()).search.includes("pg=Search")
          ) {
            throw new IpingBrowserWorkerError({
              code: "source_request_failed",
              phase,
            });
          }
          assertSession(html, phase, false);
          return html;
        };

        const pages = {
          entriesHtml: await search("&B=Y", "entry_search"),
          nationwideAwardsHtml: await search(
            "&Ctype=A",
            "nationwide_awards_search",
          ),
          districtAwardsHtml: await search(
            "&Ctype=B",
            "district_awards_search",
          ),
        };
        const totalBytes = Object.values(pages).reduce(
          (total, html) => total + new TextEncoder().encode(html).byteLength,
          0,
        );
        if (totalBytes > maximumPayloadBytes) {
          throw new IpingBrowserWorkerError({
            code: "source_schema_changed",
            phase: "district_awards_search",
          });
        }
        return pages;
      } catch (error) {
        if (error instanceof IpingBrowserWorkerError) throw error;
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new IpingBrowserWorkerError({
            code: "source_timeout",
            phase,
          });
        }
        throw new IpingBrowserWorkerError({
          code: "source_request_failed",
          phase,
        });
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
}

interface IpingHtmlPage {
  content(): Promise<string>;
  waitForLoadState(state: "domcontentloaded"): Promise<void>;
}

interface IpingSettlePage extends IpingHtmlPage {
  waitForTimeout(timeout: number): Promise<void>;
}

export async function readIpingPageContent(
  page: IpingHtmlPage,
): Promise<string> {
  try {
    return await page.content();
  } catch {
    await page.waitForLoadState("domcontentloaded");
    return page.content();
  }
}

async function readSettledHtml(
  page: IpingSettlePage,
  isSettled: (html: string) => boolean,
  attempts: number,
  intervalMs: number,
): Promise<string> {
  let html = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      html = await readIpingPageContent(page);
      if (isSettled(html)) return html;
    } catch {
      // The document is still swapping; retry inside the settle budget.
    }
    if (attempt + 1 < attempts) await page.waitForTimeout(intervalMs);
  }
  return html;
}

/**
 * iPing answers the login POST with a guest interstitial that redirects to the
 * member home from the client, so the session state is only decidable once the
 * redirect settles.
 */
export async function settleIpingSessionHtml(
  page: IpingSettlePage,
  attempts: number = sessionSettleAttempts,
  intervalMs: number = sessionSettleIntervalMs,
): Promise<string> {
  return readSettledHtml(
    page,
    (html) => {
      const state = classifyIpingSessionHtml(html);
      return state === "authenticated" || state === "challenge";
    },
    attempts,
    intervalMs,
  );
}

/** Search results settle on the result table; refused queries navigate away. */
export async function settleIpingSearchHtml(
  page: IpingSettlePage,
  attempts: number = searchSettleAttempts,
  intervalMs: number = sessionSettleIntervalMs,
): Promise<string> {
  return readSettledHtml(
    page,
    (html) => html.includes("선수명"),
    attempts,
    intervalMs,
  );
}

/** iPing rejects some query terms with an alert page that navigates back. */
export function isIpingQueryRejectionHtml(html: string): boolean {
  return /alert\((['"])[^'"]*두글자[^'"]*\1\)\s*;\s*history\.back/u.test(html);
}

function toSafeDuration(startedAt: number): number {
  return Math.min(240_000, Math.max(0, Date.now() - startedAt));
}

function asWorkerError(error: unknown): IpingBrowserWorkerError {
  return error instanceof IpingBrowserWorkerError
    ? error
    : new IpingBrowserWorkerError({
        code: "source_request_failed",
        phase: "login_page",
      });
}

export async function runIpingBrowserWorker(
  mode: IpingBrowserWorkerMode,
  credentials: IpingBrowserCredentials,
  dependencies: {
    api: IpingBrowserWorkerApi;
    collector: IpingBrowserCollector;
  },
): Promise<IpingBrowserWorkerResult> {
  const claim = await dependencies.api.claim(mode);
  if (claim.status !== "claimed") return { status: claim.status };

  const startedAt = Date.now();
  try {
    const pages = await dependencies.collector.collect(
      claim.job.name,
      credentials,
    );
    const resolution = await dependencies.api.complete(
      claim.job,
      pages,
      toSafeDuration(startedAt),
    );
    if (resolution !== "succeeded") {
      throw new IpingBrowserWorkerError(
        {
          code: "source_request_failed",
          phase: "district_awards_search",
        },
        { alreadyReported: true },
      );
    }
    return { status: "succeeded" };
  } catch (error) {
    const safe = asWorkerError(error);
    if (!safe.alreadyReported) {
      try {
        await dependencies.api.fail(
          claim.job,
          safe.failure,
          toSafeDuration(startedAt),
        );
      } catch {
        // Preserve the original safe failure without exposing worker payloads.
      }
    }
    throw safe;
  }
}

function parseMode(argv: readonly string[]): IpingBrowserWorkerMode {
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined;
  if (mode !== "drain-iping" && mode !== "recover-iping") {
    throw new Error("invalid_mode");
  }
  return mode;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("missing_configuration");
  return value;
}

export function formatIpingBrowserWorkerFailure(error: unknown): string {
  if (!(error instanceof IpingBrowserWorkerError)) return "worker_failed";
  return `${error.failure.code}:${error.failure.phase}`;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const projectId = requiredEnvironment("SUPABASE_PROJECT_ID");
  const workerToken = requiredEnvironment("REFRESH_WORKER_TOKEN");
  if (!/^[0-9a-f]{64}$/iu.test(workerToken)) {
    throw new Error("invalid_worker_token");
  }
  const credentials = {
    username: requiredEnvironment("IPING_USERNAME"),
    password: requiredEnvironment("IPING_PASSWORD"),
  };
  const result = await runIpingBrowserWorker(mode, credentials, {
    api: new EdgeIpingBrowserWorkerApi(
      `https://${projectId}.supabase.co/functions/v1/refresh-player`,
      workerToken,
    ),
    collector: new PlaywrightIpingBrowserCollector(),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `iPing browser worker failed: ${formatIpingBrowserWorkerFailure(error)}\n`,
    );
    process.exitCode = 1;
  });
}
