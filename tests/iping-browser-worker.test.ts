import { describe, expect, it, vi } from "vitest";

import {
  formatIpingBrowserWorkerFailure,
  ipingBrowserContextOptions,
  IpingBrowserWorkerError,
  isIpingQueryRejectionHtml,
  readIpingPageContent,
  resolveIpingBrowserExecutable,
  runIpingBrowserWorker,
  settleIpingSearchHtml,
  settleIpingSessionHtml,
  type ClaimedIpingBrowserJob,
  type IpingBrowserCollector,
  type IpingBrowserFailure,
  type IpingBrowserPages,
  type IpingBrowserWorkerApi,
} from "../scripts/iping-browser-worker";
import { IPING_BROWSER_USER_AGENT } from "../packages/source-adapters/src/iping/session";

describe("iPing browser executable", () => {
  it("uses an explicitly configured system browser without accepting blanks", () => {
    expect(
      resolveIpingBrowserExecutable({
        IPING_BROWSER_EXECUTABLE: " /usr/bin/chromium ",
      }),
    ).toBe("/usr/bin/chromium");
    expect(
      resolveIpingBrowserExecutable({ IPING_BROWSER_EXECUTABLE: "   " }),
    ).toBeUndefined();
  });

  it("uses the browser-compatible iPing profile in production Chromium", () => {
    expect(ipingBrowserContextOptions).toEqual({
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      userAgent: IPING_BROWSER_USER_AGENT,
    });
    expect(ipingBrowserContextOptions.userAgent).not.toContain(
      "HeadlessChrome",
    );
  });
});

describe("iPing browser failure diagnostics", () => {
  it("logs only allowlisted failure code and phase", () => {
    expect(
      formatIpingBrowserWorkerFailure(
        new IpingBrowserWorkerError({
          code: "source_request_failed",
          phase: "entry_search",
        }),
      ),
    ).toBe("source_request_failed:entry_search");
    expect(formatIpingBrowserWorkerFailure(new Error("credential=value"))).toBe(
      "worker_failed",
    );
  });
});

describe("iPing login verification", () => {
  it("retries the HTML read once after a navigation race settles", async () => {
    const content = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("page is navigating"))
      .mockResolvedValueOnce('<a href="/?pg=logout">로그아웃</a>');
    const waitForLoadState = vi.fn(async () => undefined);

    await expect(
      readIpingPageContent({ content, waitForLoadState }),
    ).resolves.toContain("로그아웃");

    expect(waitForLoadState).toHaveBeenCalledOnce();
    expect(waitForLoadState).toHaveBeenCalledWith("domcontentloaded");
    expect(content).toHaveBeenCalledTimes(2);
  });

  it("does not keep retrying when the settled page is still unreadable", async () => {
    const content = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("page closed"));

    await expect(
      readIpingPageContent({
        content,
        waitForLoadState: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("page closed");
    expect(content).toHaveBeenCalledTimes(2);
  });
});

const guestHtml = '<a href="/?pg=login">로그인</a><input name="Mid"><input name="Pwd">';
const memberHtml = '<a href="/?pg=logout">로그아웃</a>';

function settlePage(
  reads: readonly (string | Error)[],
): {
  page: {
    content: () => Promise<string>;
    waitForLoadState: () => Promise<void>;
    waitForTimeout: () => Promise<void>;
  };
  waits: { count: number };
} {
  const waits = { count: 0 };
  let index = 0;
  return {
    waits,
    page: {
      content: async () => {
        const read = reads[Math.min(index++, reads.length - 1)] ?? "";
        if (read instanceof Error) throw read;
        return read;
      },
      waitForLoadState: async () => undefined,
      waitForTimeout: async () => {
        waits.count += 1;
      },
    },
  };
}

describe("iPing session settling", () => {
  it("waits for the guest interstitial to redirect to the member page", async () => {
    const { page, waits } = settlePage([guestHtml, guestHtml, memberHtml]);

    await expect(settleIpingSessionHtml(page, 5, 1)).resolves.toContain(
      "로그아웃",
    );
    expect(waits.count).toBe(2);
  });

  it("keeps polling while the document is still swapping", async () => {
    const { page } = settlePage([
      new Error("page is navigating"),
      new Error("page is navigating"),
      memberHtml,
    ]);

    await expect(settleIpingSessionHtml(page, 5, 1)).resolves.toContain(
      "로그아웃",
    );
  });

  it("returns the guest page once the settle budget is spent", async () => {
    const { page } = settlePage([guestHtml]);

    await expect(settleIpingSessionHtml(page, 3, 1)).resolves.toBe(guestHtml);
  });

  it("settles a search page on the result table header", async () => {
    const { page, waits } = settlePage([
      new Error("page is navigating"),
      "<table><tr><td>선수명</td><td>출전이력</td></tr></table>",
    ]);

    // readIpingPageContent absorbs the first navigation race on its own.
    await expect(settleIpingSearchHtml(page, 4, 1)).resolves.toContain("선수명");
    expect(waits.count).toBe(0);
  });
});

describe("iPing refused queries", () => {
  it("detects the query rejection page without matching the search script", () => {
    expect(
      isIpingQueryRejectionHtml(
        "<script>alert('검색어를 두글자 이상 입력해주세요');history.back(-1);</script>",
      ),
    ).toBe(true);
    expect(
      isIpingQueryRejectionHtml(
        "<script>function check(){ alert('검색어를 두글자 이상 입력해주세요'); }</script>",
      ),
    ).toBe(false);
  });
});

const job: ClaimedIpingBrowserJob = {
  id: 104,
  name: "테스트선수",
  leaseToken: "11111111-1111-4111-8111-111111111111",
};

const pages: IpingBrowserPages = {
  entriesHtml: "<html>entries</html>",
  nationwideAwardsHtml: "<html>nationwide</html>",
  districtAwardsHtml: "<html>district</html>",
};

const credentials = {
  username: "worker-account",
  password: "worker-password",
};

function api(overrides: Partial<IpingBrowserWorkerApi> = {}): {
  client: IpingBrowserWorkerApi;
  fail: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
} {
  const fail = vi.fn(async () => undefined);
  const complete = vi.fn(async () => "succeeded" as const);
  return {
    fail,
    complete,
    client: {
      claim: vi.fn(async () => ({ status: "claimed" as const, job })),
      complete,
      fail,
      ...overrides,
    },
  };
}

describe("production iPing browser worker", () => {
  it("does not start a browser when the queue is empty", async () => {
    const collect = vi.fn<IpingBrowserCollector["collect"]>();
    const dependencies = api({
      claim: vi.fn(async () => ({ status: "empty" as const })),
    });

    await expect(
      runIpingBrowserWorker("drain-iping", credentials, {
        api: dependencies.client,
        collector: { collect },
      }),
    ).resolves.toEqual({ status: "empty" });
    expect(collect).not.toHaveBeenCalled();
  });

  it.each(["busy", "reset_only"] as const)(
    "treats deployment recovery status %s as a successful no-op",
    async (status) => {
      const collect = vi.fn<IpingBrowserCollector["collect"]>();
      const dependencies = api({
        claim: vi.fn(async () => ({ status })),
      });

      await expect(
        runIpingBrowserWorker("recover-iping", credentials, {
          api: dependencies.client,
          collector: { collect },
        }),
      ).resolves.toEqual({ status });
      expect(collect).not.toHaveBeenCalled();
    },
  );

  it("submits only in-memory pages under the claimed lease", async () => {
    const collect = vi.fn(async () => pages);
    const dependencies = api();

    await expect(
      runIpingBrowserWorker("drain-iping", credentials, {
        api: dependencies.client,
        collector: { collect },
      }),
    ).resolves.toEqual({ status: "succeeded" });

    expect(collect).toHaveBeenCalledWith(job.name, credentials);
    expect(dependencies.complete).toHaveBeenCalledWith(
      job,
      pages,
      expect.any(Number),
    );
    expect(dependencies.fail).not.toHaveBeenCalled();
    expect(JSON.stringify(dependencies.complete.mock.calls)).not.toContain(
      credentials.password,
    );
  });

  it("reports only an allowlisted failure and never page or credential data", async () => {
    const failure: IpingBrowserFailure = {
      code: "source_auth_failed",
      phase: "login_verify",
    };
    const dependencies = api();
    const collector: IpingBrowserCollector = {
      collect: vi.fn(async () => {
        throw new IpingBrowserWorkerError(failure);
      }),
    };

    await expect(
      runIpingBrowserWorker("recover-iping", credentials, {
        api: dependencies.client,
        collector,
      }),
    ).rejects.toMatchObject({ failure });

    expect(dependencies.complete).not.toHaveBeenCalled();
    expect(dependencies.fail).toHaveBeenCalledWith(
      job,
      failure,
      expect.any(Number),
    );
    const reported = JSON.stringify(dependencies.fail.mock.calls);
    expect(reported).not.toContain(credentials.username);
    expect(reported).not.toContain(credentials.password);
    expect(reported).not.toContain(pages.entriesHtml);
  });

  it("does not resolve the same lease twice after Edge rejects completion", async () => {
    const dependencies = api({
      complete: vi.fn(async () => "failed" as const),
    });

    await expect(
      runIpingBrowserWorker("drain-iping", credentials, {
        api: dependencies.client,
        collector: { collect: vi.fn(async () => pages) },
      }),
    ).rejects.toMatchObject({ alreadyReported: true });
    expect(dependencies.fail).not.toHaveBeenCalled();
  });
});
