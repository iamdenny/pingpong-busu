import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  displayDivisionValue,
  divisionSystemLabels,
  formatPreIntegratedDivisionNotice,
  formatDivisionObservation,
  findRecentObservedDivisionRecordForSystems,
  homonymNicknameLabel,
  isAwardRank,
  sortPlayerRecordsByLatest,
  type PlayerRecord,
} from "@busu/domain";
import { PageMetadata } from "../components/PageMetadata";
import { RefreshStatus } from "../components/RefreshStatus";
import { SourceComparison } from "../components/SourceComparison";
import { trackAnalyticsEvent } from "../lib/analytics";
import { buildPlayerMetadata } from "../lib/pageMetadata";
import { playerRepository } from "../lib/runtime";
import { useCalmEntry } from "../lib/motion";

type Tab = "history" | "awards" | "sources" | "rules";

function RecordDate({ record }: { record: PlayerRecord }) {
  if (!record.date)
    return <span className="record-date-unknown">날짜 미상</span>;
  const transitionNotice =
    record.dateBasis === "tournament"
      ? formatPreIntegratedDivisionNotice(
          record.date,
          record.tournamentRegion,
          record.divisionSystem,
          record.tournament,
        )
      : undefined;
  return (
    <span className="record-date">
      <time dateTime={record.date}>
        {record.date}
        {record.dateBasis === "published" && <small>게시일</small>}
      </time>
      {transitionNotice && (
        <small className="record-transition-note">({transitionNotice})</small>
      )}
    </span>
  );
}

function searchQueryFromState(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("searchQuery" in value))
    return undefined;
  return typeof value.searchQuery === "string" && value.searchQuery.trim()
    ? value.searchQuery
    : undefined;
}

function RecordSources({
  record,
  playerId,
}: {
  record: PlayerRecord;
  playerId: string;
}) {
  const sources = record.sources?.length
    ? record.sources
    : [
        {
          sourceCode: record.sourceCode,
          sourceName: record.sourceName,
          sourceUrl: record.sourceUrl,
          lastCheckedAt: record.lastCheckedAt,
          originalRecordId: record.id,
        },
      ];
  return (
    <span
      className="record-source-list"
      aria-label={`출처 ${sources.length}곳`}
    >
      {sources.map((source) => (
        <a
          key={`${source.sourceCode}-${source.originalRecordId}`}
          href={source.sourceUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            trackAnalyticsEvent("player_source_clicked", {
              player_id: playerId,
              source_code: source.sourceCode,
            })
          }
        >
          {source.sourceName}
          <ExternalLink size={14} />
        </a>
      ))}
    </span>
  );
}

export function PlayerDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("awards");
  const result = useQuery({
    queryKey: ["player", id],
    queryFn: () => playerRepository.getPlayer(id),
  });
  const detailRef = useCalmEntry(
    ".motion-entry",
    result.data ? `${id}-ready` : `${id}-loading`,
  );
  if (result.isLoading)
    return (
      <div className="page" aria-live="polite">
        <PageMetadata
          title="선수 상세 기록 · BUSU"
          description="선수의 부수와 대회 출전·입상 기록을 불러오고 있습니다."
          type="profile"
        />
        선수 상세를 불러오는 중입니다.
      </div>
    );
  if (!result.data)
    return (
      <div className="page empty-state">
        <PageMetadata
          title="선수를 찾을 수 없습니다 · BUSU"
          description="요청한 선수 기록을 찾을 수 없습니다. BUSU 홈에서 다시 검색해 주세요."
          robots="noindex,follow"
        />
        <h1>선수를 찾을 수 없습니다.</h1>
        <Link to="/">홈으로</Link>
      </div>
    );
  const player = result.data;
  const isAwardsTab = tab === "awards";
  const visibleRecords = isAwardsTab
    ? player.records.filter((record) => isAwardRank(record.rank))
    : player.records;
  const records = sortPlayerRecordsByLatest(visibleRecords);
  const historyTitle = isAwardsTab ? "입상 이력 (4강 이상)" : "전체 이력";
  const totalAwardCount = player.records.filter((record) =>
    isAwardRank(record.rank),
  ).length;
  const recentIntegratedDivision = findRecentObservedDivisionRecordForSystems(
    player.records,
    ["integrated", "women"],
  );
  const returnQuery = searchQueryFromState(location.state) ?? player.name;
  const nickname = homonymNicknameLabel(player.homonymNickname);
  const pageMetadata = buildPlayerMetadata({
    name: player.name,
    nickname: player.homonymNickname,
    region: player.region ?? null,
    club: player.club ?? null,
    awardCount: player.resultCount,
    sourceCount: player.sourceCount,
  });
  return (
    <div className="page detail-page" ref={detailRef}>
      <PageMetadata
        title={pageMetadata.title}
        description={pageMetadata.description}
        type="profile"
      />
      <Link
        className="back-link"
        to={`/search?q=${encodeURIComponent(returnQuery)}`}
        viewTransition
      >
        <ArrowLeft size={18} /> 검색 결과로
      </Link>
      <header className="player-header motion-entry">
        <div>
          <p className="eyebrow">
            선수 기록 ·{" "}
            {player.dataKind === "live" ? "수집된 공개 기록" : "가상 데이터"}
          </p>
          <h1>
            {player.name}
            {nickname && (
              <>
                {" "}
                <span className="player-header__nickname">{nickname}</span>
              </>
            )}
          </h1>
          {nickname && (
            <small className="player-header__nickname-note">
              동명이인 기록을 구분하기 위한 재미있는 별칭이며, 실제 실력이나
              공식 등급을 뜻하지 않습니다.
            </small>
          )}
          <p>
            {player.region
              ? `${player.dataKind === "live" ? "기록 기반 지역 추정 · " : ""}${player.region}`
              : "지역 미상"}{" "}
            · {player.club ?? "소속 미상"}
          </p>
        </div>
        <span className="identity identity--likely">
          {player.identityStatus === "verified"
            ? "참여 편집으로 연결됨"
            : "소속·지역 확인 필요"}
        </span>
      </header>
      <section className="division-summary motion-entry">
        <article>
          <span>최근 관측 부수</span>
          <strong>
            {formatDivisionObservation(
              player.recentObservedDivisionSystem,
              player.recentObservedDivision,
            )}
          </strong>
          <small>해당 대회 기록 기준</small>
        </article>
        <article>
          <span>통합부수 기록</span>
          <strong>
            {formatDivisionObservation(
              recentIntegratedDivision?.divisionSystem,
              recentIntegratedDivision?.division,
            )}
          </strong>
          <small>일반 시·군·구 대회와 여자 종목 포함</small>
        </article>
        <article>
          <span>과거 입상 기록</span>
          <strong>{totalAwardCount}건</strong>
          <small>
            4강 이상 ·{" "}
            {player.dataKind === "live" ? "수집된 공개 기록" : "가상 출처 포함"}
          </small>
        </article>
      </section>
      <RefreshStatus sources={player.sources} />
      <nav className="tabs" aria-label="선수 상세 항목">
        {(
          [
            ["awards", "입상 이력 (4강 이상)"],
            ["history", "전체 이력"],
            ["sources", "출처 비교"],
            ["rules", "대회 부수검증"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-selected={tab === key}
            role="tab"
            onClick={() => {
              if (key === tab) return;
              setTab(key);
              trackAnalyticsEvent("player_detail_tab_selected", {
                player_id: player.id,
                detail_tab: key,
              });
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {(tab === "history" || tab === "awards") && (
        <section
          key={tab}
          aria-labelledby="history-title"
          className="tab-panel-entry"
        >
          <h2 id="history-title" className="visually-hidden">
            {historyTitle}
          </h2>
          {records.length === 0 ? (
            <p className="empty-state">
              {isAwardsTab
                ? "4강 이상 입상 이력이 없습니다."
                : "확인된 대회 이력이 없습니다."}
            </p>
          ) : (
            <>
              <div className="record-table-wrap">
                <table>
                  <caption>
                    {player.name} 선수의 {historyTitle} · 최신순
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">날짜</th>
                      <th scope="col">대회</th>
                      <th scope="col">종목</th>
                      <th scope="col">당시 소속</th>
                      <th scope="col">당시 부수</th>
                      <th scope="col">결과</th>
                      <th scope="col">출처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <RecordDate record={record} />
                        </td>
                        <td>
                          <strong>{record.tournament}</strong>
                        </td>
                        <td className="record-event-name">{record.event}</td>
                        <td>{record.club ?? "-"}</td>
                        <td>
                          {record.divisionSystem ? (
                            <small>
                              {divisionSystemLabels[record.divisionSystem]}
                            </small>
                          ) : null}
                          {displayDivisionValue(
                            record.divisionSystem,
                            record.division ?? "-",
                          )}
                        </td>
                        <td>{record.rank ?? "-"}</td>
                        <td>
                          <RecordSources record={record} playerId={player.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="record-cards">
                {records.map((record) => (
                  <article key={record.id}>
                    <RecordDate record={record} />
                    <h3>{record.tournament}</h3>
                    <p>{record.club ?? "소속 미상"}</p>
                    <dl>
                      <div className="record-event-detail">
                        <dt>종목</dt>
                        <dd>{record.event}</dd>
                      </div>
                      <div>
                        <dt>당시 부수</dt>
                        <dd>
                          {formatDivisionObservation(
                            record.divisionSystem,
                            record.division ?? "-",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>결과</dt>
                        <dd>{record.rank ?? "-"}</dd>
                      </div>
                    </dl>
                    <RecordSources record={record} playerId={player.id} />
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {tab === "sources" && (
        <div key="sources" className="tab-panel-entry">
          <SourceComparison sources={player.sources} />
        </div>
      )}
      {tab === "rules" && (
        <section key="rules" className="empty-state tab-panel-entry">
          <span className="badge">준비 중</span>
          <h2>대회 부수검증</h2>
          <p>
            대회별 규정을 적용한 최소 출전 가능 부수를 근거와 함께 보여줄
            예정입니다. 자동 확정 판정이 아닙니다.
          </p>
        </section>
      )}
    </div>
  );
}
