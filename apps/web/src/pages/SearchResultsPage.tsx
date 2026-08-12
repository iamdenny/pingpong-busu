import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MapPin, Trophy, Waypoints } from "lucide-react";
import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  formatDivisionObservation,
  parsePlayerSearchQuery,
  type AwardResultSummary,
} from "@busu/domain";
import { IdentityClaimDialog } from "../components/IdentityClaimDialog";
import { PageMetadata } from "../components/PageMetadata";
import { SearchForm } from "../components/SearchForm";
import {
  SourceRefreshProgress,
  type SourceRefreshView,
} from "../components/SourceRefreshProgress";
import { summarizeObservedDivisions } from "../lib/divisionSummary";
import {
  isDevLiveMode,
  isSourceRefreshEnabled,
  playerRepository,
} from "../lib/runtime";

const identityText = {
  unreviewed: "동일인 검토 전",
  likely: "동일인 가능성 높음",
  verified: "동일인 확인됨",
  disputed: "동명이인 확인 필요",
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
  results: readonly AwardResultSummary[] | undefined,
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
          key={`${result.rank}-${result.date ?? "unknown"}-${index}`}
        >
          <strong>{result.rank}</strong>
          {result.date && (
            <time dateTime={result.date}>
              {awardDateFormatter.format(new Date(`${result.date}T00:00:00`))}
            </time>
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
  const [resultTab, setResultTab] = useState<"awards" | "entries">("awards");
  const query = params.get("q")?.trim() ?? "";
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
    queries: activeSources.map((source) => ({
      queryKey: ["source-refresh", query, source.sourceCode, location.key],
      queryFn: async () => {
        const response = await playerRepository.requestRefresh({
          name: playerSearch.name,
          ...(playerSearch.region ? { region: playerSearch.region } : {}),
          sourceCodes: [source.sourceCode],
          force: true,
        });
        void queryClient.invalidateQueries({ queryKey: ["players", query] });
        return response;
      },
      enabled: shouldRefresh,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    })),
  });
  const refreshViews: SourceRefreshView[] = activeSources.map(
    (source, index) => {
      const sourceQuery = refreshQueries[index];
      if (!sourceQuery || sourceQuery.isPending || sourceQuery.isFetching)
        return {
          sourceCode: source.sourceCode,
          sourceName: source.displayName,
          state: "refreshing",
        };
      if (sourceQuery.isError)
        return {
          sourceCode: source.sourceCode,
          sourceName: source.displayName,
          state: "failed",
        };
      const outcome = sourceQuery.data?.sources.find(
        (item) => item.sourceCode === source.sourceCode,
      );
      if (!outcome || outcome.status === "failed")
        return {
          sourceCode: source.sourceCode,
          sourceName: source.displayName,
          state: "failed",
        };
      if (outcome.status === "skipped")
        return {
          sourceCode: source.sourceCode,
          sourceName: source.displayName,
          state: "skipped",
          ...(outcome.reason ? { reason: outcome.reason } : {}),
        };
      return {
        sourceCode: source.sourceCode,
        sourceName: source.displayName,
        state: "succeeded",
        ...(outcome.found !== undefined ? { found: outcome.found } : {}),
        ...(outcome.inserted !== undefined
          ? { inserted: outcome.inserted }
          : {}),
        ...(outcome.updated !== undefined ? { updated: outcome.updated } : {}),
      };
    },
  );

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
  const divisionSummary = summarizeObservedDivisions(result.data ?? []);
  const awardCandidates =
    result.data?.filter((player) => player.resultCount > 0) ?? [];
  const entryCandidates =
    result.data?.filter((player) => player.resultCount === 0) ?? [];
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
  const searchLabel =
    `${playerSearch.name}${playerSearch.region ? ` ${playerSearch.region}` : ""}`.trim();
  const pageTitle = searchLabel
    ? `“${searchLabel}” 선수 검색 결과 · BUSU`
    : "선수 검색 결과 · BUSU";
  const pageDescription = searchLabel
    ? `${searchLabel} 선수의 최근 관측 부수, 대회 출전·4강 이상 입상 기록과 원문 출처를 확인하세요.`
    : "탁구 선수 이름과 지역으로 최근 관측 부수, 대회 출전·입상 기록과 원문 출처를 검색하세요.";

  return (
    <div className="page">
      <PageMetadata title={pageTitle} description={pageDescription} />
      <SearchForm
        key={query}
        compact
        initialQuery={query}
        onSearch={(value) => {
          setResultTab("awards");
          void navigate(`/search?q=${encodeURIComponent(value)}`);
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
      {divisionSummary.length > 0 && (
        <section
          className="division-overview"
          aria-labelledby="division-overview-title"
        >
          <div className="division-overview__heading">
            <h2 id="division-overview-title">현재 추정 부수</h2>
            <p>최근 공개 대회 기록 기준</p>
          </div>
          <div className="division-overview__table-wrap">
            <table>
              <caption className="visually-hidden">
                부수 체계별 최근 관측 부수와 기록 수
              </caption>
              <thead>
                <tr>
                  {divisionSummary.map(({ system, systemLabel, division }) => (
                    <th scope="col" key={`${system}-${division}`}>
                      {systemLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {divisionSummary.map(({ system, division, count }) => (
                    <td key={`${system}-${division}`}>
                      <strong>{division}</strong>
                      <span>{count}건</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
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
        <SourceRefreshProgress sources={refreshViews} />
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
      {duplicate && (
        <div className="identity-warning warning">
          <span role="status">
            같은 이름의 선수가 여러 명 있습니다. 이름 뒤에 지역을 함께
            입력하거나 소속을 확인해 주세요.
          </span>
          <IdentityClaimDialog candidates={identityCandidates} />
        </div>
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
      {!result.isLoading && (result.data?.length ?? 0) > 0 && (
        <div className="result-tabs" role="tablist" aria-label="검색 결과 구분">
          <button
            type="button"
            role="tab"
            aria-selected={activeResultTab === "awards"}
            disabled={awardCandidates.length === 0}
            onClick={() => setResultTab("awards")}
          >
            입상 <strong>{awardCandidates.length}건</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeResultTab === "entries"}
            disabled={entryCandidates.length === 0}
            onClick={() => setResultTab("entries")}
          >
            출전 <strong>{entryCandidates.length}건</strong>
          </button>
        </div>
      )}
      <section
        className="candidate-list"
        aria-label={`${activeResultTab === "awards" ? "입상" : "출전"} 선수 검색 결과 목록`}
        role="tabpanel"
      >
        {shownCandidates.map((player) => (
          <Link
            className="candidate-card candidate-card--link"
            key={player.id}
            to={`/players/${player.id}`}
            state={{ searchQuery: query }}
            aria-label={`${player.name}${player.region ? ` ${player.region}` : ""}${player.club ? ` ${player.club}` : ""} 상세 기록 보기`}
          >
            <article>
              <div className="candidate-card__top">
                <div className="avatar" aria-hidden="true">
                  {player.name.slice(0, 1)}
                </div>
                <div className="candidate-card__summary">
                  <div className="candidate-name-row">
                    <h2>{player.name}</h2>
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
                    <Trophy size={15} /> 입상 성적 · 날짜
                  </dt>
                  <dd className="award-result-summary">
                    <AwardResultSummary
                      results={player.awardResults}
                      resultCount={player.resultCount}
                    />
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
  );
}
