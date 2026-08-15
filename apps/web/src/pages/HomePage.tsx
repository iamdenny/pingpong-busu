import { useQuery } from "@tanstack/react-query";
import { Database, ScanSearch, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CollapsibleContent } from "../components/CollapsibleContent";
import { PageMetadata } from "../components/PageMetadata";
import { SearchForm } from "../components/SearchForm";
import { trackAnalyticsEvent } from "../lib/analytics";
import {
  clearRecentSearches,
  loadRecentSearches,
  rememberRecentSearch,
} from "../lib/recentSearches";
import { playerRepository } from "../lib/runtime";
import { useCalmEntry } from "../lib/motion";

const homeTitle = "BUSU · 탁구 선수 부수·입상 기록 통합검색";
const homeDescription =
  "여러 탁구 대회 사이트의 선수 부수, 출전·입상 기록과 원문 출처를 한곳에서 검색하고 비교하세요.";
const exampleQueries = ["김탁구", "이라켓", "김탁구 용인"] as const;

const statusText = (
  sourceCode: string,
  enabled: boolean,
  adapterMode: "http" | "browser" | "manual",
): string => {
  if (enabled) return "검색 중";
  if (adapterMode === "manual") return "원문 수동 확인";
  if (sourceCode === "iping") return "서버 계정 설정 필요";
  if (sourceCode === "yongintt") return "무료 API 키 설정 필요";
  if (sourceCode === "airping" || sourceCode === "okpingpong")
    return "운영 설정 필요";
  return "연동 준비 중";
};

export function HomePage() {
  const heroRef = useCalmEntry(".motion-entry");
  const navigate = useNavigate();
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches);
  const [sourceOverviewExpanded, setSourceOverviewExpanded] = useState(false);
  const sources = useQuery({
    queryKey: ["source-statuses"],
    queryFn: () => playerRepository.listSourceStatuses(),
    staleTime: 5 * 60 * 1000,
  });
  const activeSourceCount =
    sources.data?.filter((source) => source.enabled).length ?? 0;
  const openSearch = (query: string) => {
    rememberRecentSearch(query);
    void navigate(`/search?q=${encodeURIComponent(query)}`, {
      viewTransition: true,
    });
  };
  const clearSearchHistory = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  return (
    <div className="home-page">
      <PageMetadata title={homeTitle} description={homeDescription} />
      <section className="hero" ref={heroRef}>
        <p className="eyebrow motion-entry">탁구 기록, 근거부터 확인하세요</p>
        <h1 className="motion-entry">
          전국 탁구 선수
          <br />
          <span>부수·입상 통합조회</span>
        </h1>
        <p className="hero__description motion-entry">
          여러 대회 사이트의 저장된 기록을 먼저 보고, 출처별 차이와 마지막 확인
          시각을 함께 비교합니다.
        </p>
        <div className="motion-entry">
          <SearchForm
            onSearch={(query) =>
              navigate(`/search?q=${encodeURIComponent(query)}`, {
                viewTransition: true,
              })
            }
          />
        </div>
        <div className="examples">
          예시 검색어:{" "}
          {exampleQueries.map((query) => (
            <button key={query} type="button" onClick={() => openSearch(query)}>
              {query}
            </button>
          ))}
        </div>
        {recentSearches.length > 0 && (
          <section
            className="recent-searches"
            aria-labelledby="recent-searches-title"
          >
            <div className="recent-searches__header">
              <h2 id="recent-searches-title">최근 검색어</h2>
              <button type="button" onClick={clearSearchHistory}>
                전체 삭제
              </button>
            </div>
            <ul role="list">
              {recentSearches.map((query) => (
                <li key={query}>
                  <button type="button" onClick={() => openSearch(query)}>
                    {query}
                  </button>
                </li>
              ))}
            </ul>
            <p>최근 10개를 이 브라우저에만 저장합니다.</p>
          </section>
        )}
      </section>
      {sources.data && (
        <section className="source-overview">
          <button
            type="button"
            className="source-overview__toggle"
            aria-controls="home-source-overview-details"
            aria-expanded={sourceOverviewExpanded}
            onClick={() => setSourceOverviewExpanded((expanded) => !expanded)}
          >
            <span className="source-overview__summary">
              <strong>검색 출처</strong>
              <small>
                {activeSourceCount}곳 검색 중 · 전체 {sources.data.length}곳
              </small>
            </span>
            <span className="source-overview__action">
              상세 {sourceOverviewExpanded ? "−" : "+"}
            </span>
          </button>
          <CollapsibleContent
            id="home-source-overview-details"
            expanded={sourceOverviewExpanded}
          >
            <div className="source-overview__content">
              <p>활성 출처는 검색할 때 최신 공개 기록을 확인합니다.</p>
              <ul role="list">
                {sources.data.map((source) => (
                  <li key={source.sourceCode}>
                    <span
                      className={`source-state source-state--${source.enabled ? "active" : source.adapterMode}`}
                      aria-hidden="true"
                    />
                    <span className="source-overview__source">
                      <strong>{source.displayName}</strong>
                      <a
                        href={source.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${source.displayName} 사이트 열기`}
                        onClick={() =>
                          trackAnalyticsEvent("source_catalog_clicked", {
                            source_code: source.sourceCode,
                            source_enabled: source.enabled,
                          })
                        }
                      >
                        {source.baseUrl}
                      </a>
                    </span>
                    <small>
                      {statusText(
                        source.sourceCode,
                        source.enabled,
                        source.adapterMode,
                      )}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          </CollapsibleContent>
        </section>
      )}
      <section className="benefits" aria-label="서비스 특징">
        <article>
          <Database />
          <h2>여러 사이트 통합조회</h2>
          <p>흩어진 기록을 출처와 함께 한 화면에서 확인합니다.</p>
        </article>
        <article>
          <Users />
          <h2>별칭으로 기록 모으기</h2>
          <p>탁구 별칭을 붙여 여러 출처의 공개 기록을 한곳에 모아봅니다.</p>
        </article>
        <article>
          <ScanSearch />
          <h2>대회 기록 근거 확인</h2>
          <p>관측 부수와 입상 결과의 원문 근거를 연결합니다.</p>
        </article>
      </section>
      <aside className="notice">
        <strong>안내</strong>
        <p>
          BUSU는 공식 판정 서비스가 아닙니다. 표시된 부수는 해당 대회 기록에서
          관측된 값입니다.
        </p>
      </aside>
    </div>
  );
}
