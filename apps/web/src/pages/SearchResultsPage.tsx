import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  MapPin,
  Trophy,
  Waypoints,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  formatDivisionObservation,
  homonymNicknameLabel,
  parsePlayerSearchQuery,
  sortPlayerSearchResults,
  type AwardResultSummary,
  type SourceCode,
} from "@busu/domain";
import { IdentityClaimDialog } from "../components/IdentityClaimDialog";
import { IdentityEditHistory } from "../components/IdentityEditHistory";
import { PageMetadata } from "../components/PageMetadata";
import { SearchForm } from "../components/SearchForm";
import { trackAnalyticsEvent, trackSearchSubmitted } from "../lib/analytics";
import {
  SourceRefreshProgress,
  type SourceRefreshView,
} from "../components/SourceRefreshProgress";
import {
  divisionObservationForPlayer,
  matchesObservedDivision,
  summarizeObservedDivisionsByIdentity,
  type IdentityDivisionSummarySection,
  type DivisionSummaryItem,
} from "../lib/divisionSummary";
import {
  isDevLiveMode,
  isSourceRefreshEnabled,
  playerRepository,
} from "../lib/runtime";
import {
  asRateLimitError,
  asTimeoutError,
  manualSourceRetryAvailability,
  requireRefreshWithoutRetryableFailure,
  shouldRetrySourceRefresh,
  sourceRefreshRetryDelay,
} from "../lib/sourceRefreshRetry";

interface SourceRefreshFailureView {
  errorCode: string;
  message: string;
  retryAt?: number;
}

export function sourceRefreshFailureView(
  error: unknown,
): SourceRefreshFailureView {
  const rateLimitError = asRateLimitError(error);
  if (rateLimitError)
    return {
      errorCode: "source_rate_limited",
      message: "자동 재시도 후에도 호출 제한이 해제되지 않았습니다.",
      retryAt: rateLimitError.retryAt,
    };

  const timeoutError = asTimeoutError(error);
  if (timeoutError)
    return {
      errorCode: "source_timeout",
      message: "자동 재시도 후에도 출처 응답 시간이 초과되었습니다.",
      retryAt: timeoutError.retryAt,
    };

  return {
    errorCode: "source_request_failed",
    message: "BUSU 서버의 출처 조회 요청을 완료하지 못했습니다.",
  };
}

export interface ManualRetryAttempt {
  attempts: number;
  lastAttemptAt?: number;
}

export function sourceRetryKey(query: string, sourceCode: SourceCode): string {
  return JSON.stringify([query, sourceCode]);
}

export function clearManualRetryAttempts(
  current: Readonly<Record<string, ManualRetryAttempt>>,
  keys: readonly string[],
): Readonly<Record<string, ManualRetryAttempt>> {
  const matchedKeys = keys.filter((key) => current[key] !== undefined);
  if (matchedKeys.length === 0) return current;
  const next = { ...current };
  for (const key of matchedKeys) delete next[key];
  return next;
}

export interface ManualRefreshRequest {
  requestId: number;
  searchCycleKey: string;
}

export function isForcedSourceRefresh(
  manualRefreshRequest: ManualRefreshRequest | undefined,
  currentSearchCycleKey: string,
): boolean {
  return manualRefreshRequest?.searchCycleKey === currentSearchCycleKey;
}

type ResultTab = "awards" | "entries";
type ResultTabDirection = "none" | "forward" | "backward";

interface DivisionSelection {
  query: string;
  sectionKey: string;
  system: DivisionSummaryItem["system"];
  division: string;
}

const identityText = {
  unreviewed: "참여 확인 전",
  likely: "같은 사람 가능성 있음",
  verified: "참여 편집으로 연결됨",
  disputed: "동명이인 이견 있음",
} as const;
const awardDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function AwardResultSummary({
  results,
  resultCount,
}: {
  results: readonly AwardResultSummary[] | undefined;
  resultCount: number;
}) {
  if (!results?.length) return <>{resultCount}건</>;
  const shown = results.slice(0, 2);
  const remaining = Math.max(0, resultCount - shown.length);

  return (
    <span className="award-result-summary__list">
      {shown.map((result, index) => (
        <span
          className="award-result-summary__item"
          key={`${result.rank}-${result.date ?? "unknown"}-${result.tournament ?? "unknown"}-${index}`}
        >
          <strong>{result.rank}</strong>
          {result.date && (
            <time dateTime={result.date}>
              {awardDateFormatter.format(new Date(`${result.date}T00:00:00`))}
            </time>
          )}
          {result.tournament && (
            <span
              className="award-result-summary__tournament"
              title={result.tournament}
            >
              {result.tournament}
            </span>
          )}
          {result.event && (
            <span className="result-event" title={result.event}>
              <span aria-hidden="true">종목 · </span>
              {result.event}
            </span>
          )}
          {result.sourceCount && result.sourceCount > 1 && (
            <span className="award-result-summary__sources">
              출처 {result.sourceCount}곳
            </span>
          )}
        </span>
      ))}
      {remaining > 0 && (
        <span className="award-result-summary__remaining">
          외 {remaining}건
        </span>
      )}
    </span>
  );
}

function ParticipationResultSummary({
  tournament,
  event,
  date,
}: {
  tournament: string | undefined;
  event: string | undefined;
  date: string | undefined;
}) {
  if (!tournament && !event && !date) return <>대회·종목 확인 필요</>;
  return (
    <span className="participation-result-summary">
      <strong title={tournament}>{tournament ?? "대회명 확인 필요"}</strong>
      {event && (
        <span className="result-event" title={event}>
          <span aria-hidden="true">종목 · </span>
          {event}
        </span>
      )}
      {date && (
        <time dateTime={date}>
          {awardDateFormatter.format(new Date(`${date}T00:00:00`))}
        </time>
      )}
    </span>
  );
}

function directSearchUrl(
  sourceCode: string,
  baseUrl: string,
  query: string,
): string {
  if (sourceCode === "airping") {
    const url = new URL("https://airping.co.kr/11player/01.php");
    url.searchParams.set("key", "r_name");
    url.searchParams.set("keyword", query);
    return url.toString();
  }
  if (sourceCode === "okpingpong") {
    const url = new URL("http://okpingpong.co.kr/04match/08.php");
    url.searchParams.set("key", "name");
    url.searchParams.set("keyword", query);
    return url.toString();
  }
  return baseUrl;
}

export function SearchResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [resultTab, setResultTab] = useState<ResultTab>("awards");
  const [resultTabDirection, setResultTabDirection] =
    useState<ResultTabDirection>("none");
  const [divisionSelection, setDivisionSelection] =
    useState<DivisionSelection | null>(null);
  const candidateListRef = useRef<HTMLElement>(null);
  const trackedSearchRef = useRef<string | undefined>(undefined);
  const [manualRetryAttempts, setManualRetryAttempts] = useState<
    Readonly<Record<string, ManualRetryAttempt>>
  >({});
  const manualRetryAttemptsRef = useRef<
    Readonly<Record<string, ManualRetryAttempt>>
  >({});
  const [manualRefreshRequests, setManualRefreshRequests] = useState<
    Readonly<Record<string, ManualRefreshRequest>>
  >({});
  const query = params.get("q")?.trim() ?? "";
  const searchCycleKey = `${location.key}\u0000${query}`;
  const playerSearch = parsePlayerSearchQuery(query);
  const result = useQuery({
    queryKey: ["players", query],
    queryFn: () =>
      playerRepository.searchPlayers({
        query: playerSearch.name,
        ...(playerSearch.region ? { region: playerSearch.region } : {}),
      }),
    enabled: playerSearch.name.length > 0,
  });

  const shouldRefresh =
    (isDevLiveMode || isSourceRefreshEnabled) && playerSearch.name.length >= 2;
  const canStartSourceRefresh = shouldRefresh && result.isSuccess;
  const sourceStatuses = useQuery({
    queryKey: ["source-statuses"],
    queryFn: () => playerRepository.listSourceStatuses(),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const activeSources =
    sourceStatuses.data?.filter((source) => source.enabled) ?? [];
  const directSources =
    sourceStatuses.data?.filter(
      (source) =>
        !source.enabled &&
        ["airping", "okpingpong", "iping"].includes(source.sourceCode),
    ) ?? [];
  const refreshQueries = useQueries({
    queries: activeSources.map((source) => {
      const manualRefreshRequest =
        manualRefreshRequests[sourceRetryKey(query, source.sourceCode)];
      return {
        queryKey: [
          "source-refresh",
          query,
          source.sourceCode,
          location.key,
          manualRefreshRequest?.requestId ?? 0,
        ],
        queryFn: async () => {
          const response = await playerRepository.requestRefresh({
            name: playerSearch.name,
            ...(playerSearch.region ? { region: playerSearch.region } : {}),
            sourceCodes: [source.sourceCode],
            force: isForcedSourceRefresh(manualRefreshRequest, searchCycleKey),
          });
          requireRefreshWithoutRetryableFailure(response, source.sourceCode);
          void queryClient.invalidateQueries({ queryKey: ["players", query] });
          return response;
        },
        enabled: canStartSourceRefresh,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: shouldRetrySourceRefresh,
        retryDelay: sourceRefreshRetryDelay,
      };
    }),
  });
  const refreshViews: SourceRefreshView[] = canStartSourceRefresh
    ? activeSources.map((source, index) => {
        const sourceQuery = refreshQueries[index];
        const pendingFailure = sourceRefreshFailureView(
          sourceQuery?.failureReason,
        );
        if (pendingFailure.retryAt !== undefined && !sourceQuery?.isError)
          return {
            sourceCode: source.sourceCode,
            sourceName: source.displayName,
            state: "waiting",
            reason: pendingFailure.errorCode,
            retryAt: pendingFailure.retryAt,
          };
        if (!sourceQuery || sourceQuery.isPending || sourceQuery.isFetching)
          return {
            sourceCode: source.sourceCode,
            sourceName: source.displayName,
            state: "refreshing",
          };
        if (sourceQuery.isError) {
          const failure = sourceRefreshFailureView(sourceQuery.error);
          return {
            sourceCode: source.sourceCode,
            sourceName: source.displayName,
            state: "failed",
            errorCode: failure.errorCode,
            message: failure.message,
            ...manualRetryView(
              source.sourceCode,
              sourceQuery.errorUpdatedAt,
              failure.retryAt,
            ),
          };
        }
        const outcome = sourceQuery.data?.sources.find(
          (item) => item.sourceCode === source.sourceCode,
        );
        if (!outcome || outcome.status === "failed")
          return {
            sourceCode: source.sourceCode,
            sourceName: source.displayName,
            state: "failed",
            errorCode: outcome?.errorCode ?? "source_refresh_failed",
            message: outcome?.message ?? "출처 응답을 확인하지 못했습니다.",
            ...manualRetryView(
              source.sourceCode,
              sourceQuery.dataUpdatedAt,
              outcome?.retryAfterMs !== undefined
                ? sourceQuery.dataUpdatedAt + outcome.retryAfterMs
                : undefined,
            ),
          };
        if (outcome.status === "skipped")
          return {
            sourceCode: source.sourceCode,
            sourceName: source.displayName,
            state: "skipped",
            ...(outcome.reason ? { reason: outcome.reason } : {}),
            ...(outcome.message ? { message: outcome.message } : {}),
          };
        return {
          sourceCode: source.sourceCode,
          sourceName: source.displayName,
          state: "succeeded",
          ...(outcome.found !== undefined ? { found: outcome.found } : {}),
          ...(outcome.inserted !== undefined
            ? { inserted: outcome.inserted }
            : {}),
          ...(outcome.updated !== undefined
            ? { updated: outcome.updated }
            : {}),
        };
      })
    : [];

  function retryKey(sourceCode: SourceCode): string {
    return sourceRetryKey(query, sourceCode);
  }

  const successfulRetryKeys = refreshViews
    .filter((source) => source.state === "succeeded")
    .map((source) => retryKey(source.sourceCode))
    .join("\n");

  useEffect(() => {
    if (!successfulRetryKeys) return;
    const nextAttempts = clearManualRetryAttempts(
      manualRetryAttemptsRef.current,
      successfulRetryKeys.split("\n"),
    );
    if (nextAttempts === manualRetryAttemptsRef.current) return;
    manualRetryAttemptsRef.current = nextAttempts;
    setManualRetryAttempts(nextAttempts);
  }, [successfulRetryKeys]);

  function manualRetryView(
    sourceCode: SourceCode,
    failureAt: number,
    notBeforeAt?: number,
  ) {
    const current = manualRetryAttempts[retryKey(sourceCode)];
    const availability = manualSourceRetryAvailability({
      attempts: current?.attempts ?? 0,
      failureAt,
      ...(current?.lastAttemptAt !== undefined
        ? { lastAttemptAt: current.lastAttemptAt }
        : {}),
      ...(notBeforeAt !== undefined ? { notBeforeAt } : {}),
    });
    return {
      manualRetryAt: availability.retryAt,
      manualRetriesRemaining: availability.remainingAttempts,
    };
  }

  function retrySource(sourceCode: SourceCode, attemptedAt: number) {
    const sourceIndex = activeSources.findIndex(
      (source) => source.sourceCode === sourceCode,
    );
    const sourceQuery = refreshQueries[sourceIndex];
    if (!sourceQuery || sourceQuery.isFetching) return;
    const key = retryKey(sourceCode);
    const current = manualRetryAttemptsRef.current[key];
    const failureAt = Math.max(
      sourceQuery.errorUpdatedAt,
      sourceQuery.dataUpdatedAt,
    );
    const outcome = sourceQuery.data?.sources.find(
      (item) => item.sourceCode === sourceCode,
    );
    const automaticRetryAt =
      sourceRefreshFailureView(sourceQuery.error).retryAt ??
      (outcome?.retryAfterMs !== undefined
        ? sourceQuery.dataUpdatedAt + outcome.retryAfterMs
        : undefined);
    const availability = manualSourceRetryAvailability({
      attempts: current?.attempts ?? 0,
      failureAt,
      ...(current?.lastAttemptAt !== undefined
        ? { lastAttemptAt: current.lastAttemptAt }
        : {}),
      ...(automaticRetryAt !== undefined
        ? { notBeforeAt: automaticRetryAt }
        : {}),
    });
    if (!availability.canRetry) return;
    const nextAttempts = {
      ...manualRetryAttemptsRef.current,
      [key]: {
        attempts: (current?.attempts ?? 0) + 1,
        lastAttemptAt: attemptedAt,
      },
    };
    manualRetryAttemptsRef.current = nextAttempts;
    setManualRetryAttempts(nextAttempts);
    setManualRefreshRequests((current) => ({
      ...current,
      [key]: {
        requestId: (current[key]?.requestId ?? 0) + 1,
        searchCycleKey,
      },
    }));
  }

  const identityCandidates =
    result.data?.filter(
      (player) => player.normalizedName === result.data[0]?.normalizedName,
    ) ?? [];
  const duplicate = identityCandidates.length > 1;
  const waitingForLive =
    shouldRefresh &&
    (sourceStatuses.isLoading ||
      refreshViews.some(
        (source) => source.state === "waiting" || source.state === "refreshing",
      ));
  const divisionSummarySections = summarizeObservedDivisionsByIdentity(
    result.data ?? [],
  );
  const showsIdentityDivisionSections =
    divisionSummarySections.length > 1 ||
    divisionSummarySections.some((section) => section.isAssigned);
  const selectedDivisionSection =
    divisionSelection?.query === query
      ? divisionSummarySections.find(
          (section) => section.key === divisionSelection.sectionKey,
        )
      : undefined;
  const selectedDivision =
    selectedDivisionSection && divisionSelection
      ? selectedDivisionSection.summaries.find(
          (item) =>
            item.system === divisionSelection.system &&
            item.division === divisionSelection.division,
        )
      : undefined;
  const selectedDivisionKey = selectedDivision
    ? `${query}\u0000${selectedDivisionSection?.key}\u0000${selectedDivision.system}\u0000${selectedDivision.division}`
    : null;
  const divisionCandidates = selectedDivision
    ? (selectedDivisionSection?.players ?? []).filter((player) =>
        matchesObservedDivision(player, selectedDivision),
      )
    : (result.data ?? []);
  const awardCandidates = sortPlayerSearchResults(
    divisionCandidates.filter((player) =>
      selectedDivision
        ? (divisionObservationForPlayer(player, selectedDivision)?.awardCount ??
            0) > 0
        : player.resultCount > 0,
    ),
    "awards",
  );
  const entryCandidates = sortPlayerSearchResults(
    divisionCandidates.filter((player) =>
      selectedDivision
        ? (divisionObservationForPlayer(player, selectedDivision)
            ?.participationCount ?? 0) > 0
        : player.resultCount === 0,
    ),
    "entries",
  );
  const activeResultTab =
    resultTab === "awards"
      ? awardCandidates.length > 0 || entryCandidates.length === 0
        ? "awards"
        : "entries"
      : entryCandidates.length > 0 || awardCandidates.length === 0
        ? "entries"
        : "awards";
  const shownCandidates =
    activeResultTab === "awards" ? awardCandidates : entryCandidates;

  useEffect(() => {
    if (!result.isSuccess || trackedSearchRef.current === query) return;
    trackedSearchRef.current = query;
    trackSearchSubmitted(query, result.data.length);
  }, [query, result.data, result.isSuccess]);
  const candidateListLabel = selectedDivision
    ? `${showsIdentityDivisionSections && selectedDivisionSection ? `${selectedDivisionSection.label} ` : ""}${selectedDivision.systemLabel} ${selectedDivision.division} ${activeResultTab === "awards" ? "입상" : "출전"} 선수 검색 결과 목록`
    : `${activeResultTab === "awards" ? "입상" : "출전"} 선수 검색 결과 목록`;
  const searchLabel =
    `${playerSearch.name}${playerSearch.region ? ` ${playerSearch.region}` : ""}`.trim();
  const pageTitle = searchLabel
    ? `“${searchLabel}” 선수 검색 결과 · BUSU`
    : "선수 검색 결과 · BUSU";
  const pageDescription = searchLabel
    ? `${searchLabel} 선수의 최근 관측 부수, 대회 출전·4강 이상 입상 기록과 원문 출처를 확인하세요.`
    : "탁구 선수 이름과 지역으로 최근 관측 부수, 대회 출전·입상 기록과 원문 출처를 검색하세요.";

  useEffect(() => {
    if (!selectedDivisionKey) return;
    candidateListRef.current?.scrollIntoView?.({ block: "start" });
    candidateListRef.current?.focus({ preventScroll: true });
  }, [selectedDivisionKey]);

  function selectDivision(
    section: IdentityDivisionSummarySection,
    summary: DivisionSummaryItem,
  ) {
    trackAnalyticsEvent("division_filter_selected", {
      division_system: summary.system,
      division: summary.division,
      award_count: summary.awardCount,
      participation_count: summary.participationCount,
    });
    setResultTabDirection("none");
    setDivisionSelection({
      query,
      sectionKey: section.key,
      system: summary.system,
      division: summary.division,
    });
    setResultTab(summary.awardCount > 0 ? "awards" : "entries");
  }

  function clearDivisionSelection() {
    setResultTabDirection("none");
    setDivisionSelection(null);
    setResultTab(
      (result.data ?? []).some((player) => player.resultCount > 0)
        ? "awards"
        : "entries",
    );
  }

  function selectResultTab(nextTab: ResultTab) {
    if (nextTab === activeResultTab) return;
    trackAnalyticsEvent("search_result_tab_selected", { result_tab: nextTab });
    setResultTabDirection(nextTab === "entries" ? "forward" : "backward");
    setResultTab(nextTab);
  }

  return (
    <div className="page">
      <PageMetadata title={pageTitle} description={pageDescription} />
      <SearchForm
        key={query}
        compact
        initialQuery={query}
        onSearch={(value) => {
          setResultTabDirection("none");
          setResultTab("awards");
          setDivisionSelection(null);
          void navigate(`/search?q=${encodeURIComponent(value)}`, {
            viewTransition: true,
          });
        }}
      />
      <div className="page-heading">
        <div>
          <p className="eyebrow">검색 결과</p>
          <h1>
            “{playerSearch.name}” 선수
            {playerSearch.region ? ` · ${playerSearch.region}` : ""}
          </h1>
        </div>
        <strong>{result.data?.length ?? 0}건</strong>
      </div>
      {divisionSummarySections.some(
        (section) => section.summaries.length > 0,
      ) && (
        <section
          className={`division-overview${showsIdentityDivisionSections ? " division-overview--grouped" : ""}`}
          aria-labelledby="division-overview-title"
        >
          <div className="division-overview__heading">
            <h2 id="division-overview-title">현재 추정 부수</h2>
            <p>최근 개인전 기록 기준</p>
          </div>
          <div className="division-overview__sections">
            {divisionSummarySections.map((section, sectionIndex) => {
              const headingId = `division-overview-section-${sectionIndex}`;
              return (
                <div className="division-overview__section" key={section.key}>
                  {showsIdentityDivisionSections && (
                    <div className="division-overview__identity-heading">
                      <h3 id={headingId}>{section.label}</h3>
                      <span>
                        {section.isAssigned
                          ? "별칭으로 연결된 기록"
                          : "아직 별칭이 없는 기록"}
                      </span>
                    </div>
                  )}
                  <div className="division-overview__table-wrap">
                    <table
                      aria-labelledby={
                        showsIdentityDivisionSections ? headingId : undefined
                      }
                    >
                      <caption className="visually-hidden">
                        {showsIdentityDivisionSections
                          ? `${section.label}의 `
                          : ""}
                        부수 체계별 최근 관측 부수와 입상 및 참가 기록 수
                      </caption>
                      <colgroup>
                        <col className="division-overview__system-column" />
                        <col />
                      </colgroup>
                      <tbody>
                        {section.groups.flatMap((group) =>
                          group.rows.map((row, rowIndex) => (
                            <tr
                              key={`${group.system}-${row.kind}`}
                              className={`division-overview__subrow division-overview__subrow--${row.kind}`}
                            >
                              {rowIndex === 0 && (
                                <th scope="row" rowSpan={group.rows.length}>
                                  {group.systemLabel}
                                </th>
                              )}
                              <td>
                                <span className="visually-hidden">
                                  {group.systemLabel} {row.label}
                                </span>
                                <ul className="division-overview__items">
                                  {row.items.map((summary) => (
                                    <li
                                      key={`${summary.system}-${summary.division}`}
                                    >
                                      <button
                                        type="button"
                                        className="division-overview__filter"
                                        aria-controls="candidate-results"
                                        aria-pressed={
                                          selectedDivisionSection?.key ===
                                            section.key &&
                                          selectedDivision?.system ===
                                            summary.system &&
                                          selectedDivision.division ===
                                            summary.division
                                        }
                                        aria-label={`${showsIdentityDivisionSections ? `${section.label}, ` : ""}${summary.systemLabel} ${summary.division} 입상 ${summary.awardCount}건 참가 ${summary.participationCount}건 결과 보기`}
                                        onClick={() =>
                                          selectDivision(section, summary)
                                        }
                                      >
                                        <strong>{summary.division}</strong>
                                        <span className="division-overview__counts">
                                          <span>
                                            입상 <b>{summary.awardCount}건</b>
                                          </span>
                                          <span>
                                            참가{" "}
                                            <b>
                                              {summary.participationCount}건
                                            </b>
                                          </span>
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {shouldRefresh && sourceStatuses.isLoading && (
        <div className="refreshing-notice">
          <span
            className="status-dot status-dot--refreshing"
            aria-hidden="true"
          />{" "}
          조회할 공개 사이트를 확인하고 있습니다.
        </div>
      )}
      {refreshViews.length > 0 && (
        <SourceRefreshProgress
          key={searchCycleKey}
          sources={refreshViews}
          existingRecordCount={result.data?.length ?? null}
          searchKey={searchCycleKey}
          onRetry={retrySource}
        />
      )}
      {directSources.length > 0 && (
        <aside
          className="direct-source-links"
          aria-label="원문 사이트 직접 검색"
        >
          <strong>원문 직접 검색</strong>
          <span>
            {directSources.map((source) => (
              <a
                key={source.sourceCode}
                href={directSearchUrl(
                  source.sourceCode,
                  source.baseUrl,
                  playerSearch.name,
                )}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackAnalyticsEvent("direct_source_search_clicked", {
                    source_code: source.sourceCode,
                  })
                }
              >
                {source.displayName}
                {source.sourceCode === "iping" ? " (로그인)" : ""}
              </a>
            ))}
          </span>
          <small>링크만 제공하며 BUSU에 기록을 복제하지 않습니다.</small>
        </aside>
      )}
      {sourceStatuses.isError && (
        <div className="warning" role="status">
          조회할 출처 목록을 불러오지 못했습니다. 현재 저장된 기록만 표시합니다.
        </div>
      )}
      {identityCandidates.length > 0 && (
        <div className="identity-warning warning">
          {duplicate ? (
            <span role="status">
              같은 이름의 선수가 여러 명 있습니다. 이름 뒤에 지역을 함께
              입력하거나 소속을 확인해 주세요.
            </span>
          ) : (
            <span>
              내 기록이라면 탁구 별칭을 붙여 여러 출처의 기록을 한곳에 모아볼 수
              있습니다.
            </span>
          )}
          <IdentityClaimDialog candidates={identityCandidates} />
        </div>
      )}
      {playerSearch.name.length > 0 && (
        <IdentityEditHistory normalizedName={playerSearch.name} />
      )}
      {result.isLoading && (
        <p aria-live="polite">저장된 기록을 불러오는 중입니다.</p>
      )}
      {result.isError && (
        <div className="error-state">
          일부 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}
      {!waitingForLive && !result.isLoading && result.data?.length === 0 && (
        <div className="empty-state">
          <h2>확인된 대회 기록이 없습니다.</h2>
          <p>이름의 띄어쓰기나 소속 클럽을 바꿔 검색해 보세요.</p>
        </div>
      )}
      <div className="candidate-results-area">
        {!result.isLoading && (result.data?.length ?? 0) > 0 && (
          <>
            {selectedDivision && (
              <div className="division-result-filter">
                <span role="status">
                  <strong>
                    {showsIdentityDivisionSections && selectedDivisionSection
                      ? `${selectedDivisionSection.label} · `
                      : ""}
                    {selectedDivision.systemLabel} {selectedDivision.division}
                  </strong>{" "}
                  {divisionCandidates.length}건만 표시 중
                </span>
                <button type="button" onClick={clearDivisionSelection}>
                  부수 필터 해제
                </button>
              </div>
            )}
            <div className="result-tabs-sticky">
              <div
                className="result-tabs"
                role="tablist"
                aria-label="검색 결과 구분"
                data-active-tab={activeResultTab}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeResultTab === "awards"}
                  disabled={awardCandidates.length === 0}
                  onClick={() => selectResultTab("awards")}
                >
                  입상 <strong>{awardCandidates.length}건</strong>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeResultTab === "entries"}
                  disabled={entryCandidates.length === 0}
                  onClick={() => selectResultTab("entries")}
                >
                  출전 <strong>{entryCandidates.length}건</strong>
                </button>
              </div>
            </div>
          </>
        )}
        <div className="candidate-list-viewport">
          <section
            key={activeResultTab}
            id="candidate-results"
            ref={candidateListRef}
            className="candidate-list"
            data-transition-direction={resultTabDirection}
            aria-label={candidateListLabel}
            role="tabpanel"
            tabIndex={-1}
          >
            {shownCandidates.map((player, index) => (
              <Link
                className="candidate-card candidate-card--link"
                key={player.id}
                to={`/players/${player.id}`}
                state={{ searchQuery: query }}
                onClick={() =>
                  trackAnalyticsEvent("search_result_clicked", {
                    player_id: player.id,
                    position: index + 1,
                    result_tab: activeResultTab,
                  })
                }
                aria-label={`${player.name}${player.homonymNickname ? ` ${homonymNicknameLabel(player.homonymNickname)}` : ""}${player.region ? ` ${player.region}` : ""}${player.club ? ` ${player.club}` : ""} 상세 기록 보기`}
              >
                <article>
                  <div className="candidate-card__top">
                    <div className="avatar" aria-hidden="true">
                      {player.name.slice(0, 1)}
                    </div>
                    <div className="candidate-card__summary">
                      <div className="candidate-name-row">
                        <h2>{player.name}</h2>
                        {player.homonymNickname && (
                          <span className="homonym-nickname-badge">
                            {homonymNicknameLabel(player.homonymNickname)}
                          </span>
                        )}
                        <span
                          className={`data-badge data-badge--${player.dataKind ?? "demo"}`}
                        >
                          {player.dataKind === "live"
                            ? "실제 공개 기록"
                            : "가상 데이터"}
                        </span>
                      </div>
                      <p>
                        <MapPin size={16} />{" "}
                        {player.region
                          ? `${player.dataKind === "live" ? "기록 기반 추정 · " : ""}${player.region}`
                          : "지역 미상"}{" "}
                        · {player.club ?? "소속 미상"}
                      </p>
                    </div>
                    <div className="candidate-card__meta">
                      <span
                        className={`identity identity--${player.identityStatus}`}
                      >
                        {identityText[player.identityStatus]}
                      </span>
                      <span className="candidate-card__checked">
                        최근 확인{" "}
                        {new Intl.DateTimeFormat("ko-KR", {
                          dateStyle: "medium",
                        }).format(new Date(player.lastCheckedAt))}
                        <ChevronRight aria-hidden="true" size={17} />
                      </span>
                    </div>
                  </div>
                  <dl className="stats">
                    <div>
                      <dt>최근 관측 부수</dt>
                      <dd>
                        {formatDivisionObservation(
                          player.recentObservedDivisionSystem,
                          player.recentObservedDivision,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {activeResultTab === "awards" ? (
                          <>
                            <Trophy size={15} /> 입상 성적 · 날짜 · 대회 · 종목
                          </>
                        ) : (
                          <>
                            <CalendarDays size={15} /> 최근 출전 대회 · 종목 ·
                            날짜
                          </>
                        )}
                      </dt>
                      <dd className="award-result-summary">
                        {activeResultTab === "awards" ? (
                          <AwardResultSummary
                            results={player.awardResults}
                            resultCount={player.resultCount}
                          />
                        ) : (
                          <ParticipationResultSummary
                            tournament={player.latestParticipationTournament}
                            event={player.latestParticipationEvent}
                            date={player.latestParticipationDate}
                          />
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Waypoints size={15} /> 출처
                      </dt>
                      <dd>{player.sourceCount}곳</dd>
                    </div>
                  </dl>
                </article>
              </Link>
            ))}
            {!result.isLoading &&
              (result.data?.length ?? 0) > 0 &&
              shownCandidates.length === 0 && (
                <div className="empty-state">
                  <h2>
                    {activeResultTab === "awards"
                      ? "입상 기록이 없습니다."
                      : "출전 기록만 있는 후보가 없습니다."}
                  </h2>
                  <p>다른 탭에서 확인해 보세요.</p>
                </div>
              )}
          </section>
        </div>
      </div>
    </div>
  );
}
