import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Trophy, Waypoints } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { divisionSystemLabels } from '@busu/domain';
import { SearchForm } from '../components/SearchForm';
import { SourceRefreshProgress, type SourceRefreshView } from '../components/SourceRefreshProgress';
import { summarizeObservedDivisions } from '../lib/divisionSummary';
import { isDevLiveMode, isSourceRefreshEnabled, playerRepository } from '../lib/runtime';

const identityText = { unreviewed: '동일인 검토 전', likely: '동일인 가능성 높음', verified: '동일인 확인됨', disputed: '동명이인 확인 필요' } as const;

export function SearchResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const query = params.get('q')?.trim() ?? '';
  const result = useQuery({ queryKey: ['players', query], queryFn: () => playerRepository.searchPlayers({ query }), enabled: query.length > 0 });
  const shouldRefresh = (isDevLiveMode || isSourceRefreshEnabled) && query.length >= 2;
  const sourceStatuses = useQuery({ queryKey: ['source-statuses'], queryFn: () => playerRepository.listSourceStatuses(), enabled: shouldRefresh, staleTime: 5 * 60 * 1000 });
  const activeSources = sourceStatuses.data?.filter((source) => source.enabled) ?? [];
  const refreshQueries = useQueries({ queries: activeSources.map((source) => ({
    queryKey: ['source-refresh', query, source.sourceCode, location.key],
    queryFn: async () => {
      const response = await playerRepository.requestRefresh({ name: query, sourceCodes: [source.sourceCode], force: true });
      void queryClient.invalidateQueries({ queryKey: ['players', query] });
      return response;
    },
    enabled: shouldRefresh,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })) });
  const refreshViews: SourceRefreshView[] = activeSources.map((source, index) => {
    const sourceQuery = refreshQueries[index];
    if (!sourceQuery || sourceQuery.isPending || sourceQuery.isFetching) return { sourceCode: source.sourceCode, sourceName: source.displayName, state: 'refreshing' };
    if (sourceQuery.isError) return { sourceCode: source.sourceCode, sourceName: source.displayName, state: 'failed' };
    const outcome = sourceQuery.data?.sources.find((item) => item.sourceCode === source.sourceCode);
    if (!outcome || outcome.status === 'failed') return { sourceCode: source.sourceCode, sourceName: source.displayName, state: 'failed' };
    if (outcome.status === 'skipped') return { sourceCode: source.sourceCode, sourceName: source.displayName, state: 'skipped', ...(outcome.reason ? { reason: outcome.reason } : {}) };
    return { sourceCode: source.sourceCode, sourceName: source.displayName, state: 'succeeded', ...(outcome.found !== undefined ? { found: outcome.found } : {}), ...(outcome.inserted !== undefined ? { inserted: outcome.inserted } : {}), ...(outcome.updated !== undefined ? { updated: outcome.updated } : {}) };
  });

  const duplicate = (result.data?.filter((player) => player.normalizedName === result.data[0]?.normalizedName).length ?? 0) > 1;
  const waitingForLive = shouldRefresh && (sourceStatuses.isLoading || refreshViews.some((source) => source.state === 'waiting' || source.state === 'refreshing'));
  const divisionSummary = summarizeObservedDivisions(result.data ?? []);

  return <div className="page">
    <SearchForm key={query} compact initialQuery={query} onSearch={(value) => navigate(`/search?q=${encodeURIComponent(value)}`)} />
    <div className="page-heading"><div><p className="eyebrow">검색 결과</p><h1>“{query}” 선수</h1></div><strong>{result.data?.length ?? 0}건</strong></div>
    {divisionSummary.length > 0 && <section className="division-overview" aria-labelledby="division-overview-title"><div><h2 id="division-overview-title">현재 추정 부수</h2><p>최근 공개 대회 기록을 부수 체계별로 나눠 취합했습니다.</p></div><ul role="list">{divisionSummary.map(({ system, systemLabel, division, count }) => <li key={`${system}-${division}`}><span className="division-system-label">{systemLabel}</span><strong>{division}</strong><span>{count}건</span></li>)}</ul></section>}
    {shouldRefresh && sourceStatuses.isLoading && <div className="refreshing-notice"><span className="status-dot status-dot--refreshing" aria-hidden="true" /> 조회할 공개 사이트를 확인하고 있습니다.</div>}
    {refreshViews.length > 0 && <SourceRefreshProgress sources={refreshViews} />}
    {sourceStatuses.isError && <div className="warning" role="status">조회할 출처 목록을 불러오지 못했습니다. 현재 저장된 기록만 표시합니다.</div>}
    {duplicate && <div className="warning" role="status">같은 이름의 선수가 여러 명 있습니다. 소속과 활동 지역을 확인해 주세요.</div>}
    {result.isLoading && <p aria-live="polite">저장된 기록을 불러오는 중입니다.</p>}
    {result.isError && <div className="error-state">일부 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}
    {!waitingForLive && !result.isLoading && result.data?.length === 0 && <div className="empty-state"><h2>확인된 대회 기록이 없습니다.</h2><p>이름의 띄어쓰기나 소속 클럽을 바꿔 검색해 보세요.</p></div>}
    <section className="candidate-list" aria-label="선수 검색 결과 목록">
      {result.data?.map((player) => <article className="candidate-card" key={player.id}>
        <div className="candidate-card__top"><div className="avatar" aria-hidden="true">{player.name.slice(0, 1)}</div><div><div className="candidate-name-row"><h2>{player.name}</h2><span className={`data-badge data-badge--${player.dataKind ?? 'demo'}`}>{player.dataKind === 'live' ? '실제 공개 기록' : '가상 데이터'}</span></div><p><MapPin size={16} /> {player.region ? `${player.dataKind === 'live' ? '기록 기반 추정 · ' : ''}${player.region}` : '지역 미상'} · {player.club ?? '소속 미상'}</p></div><span className={`identity identity--${player.identityStatus}`}>{identityText[player.identityStatus]}</span></div>
        <dl className="stats"><div><dt>최근 관측 부수</dt><dd>{player.recentObservedDivisionSystem ? `${divisionSystemLabels[player.recentObservedDivisionSystem]} · ` : ''}{player.recentObservedDivision ?? '확인 필요'}</dd></div><div><dt><Trophy size={15} /> 입상 기록</dt><dd>{player.resultCount}건</dd></div><div><dt><Waypoints size={15} /> 출처</dt><dd>{player.sourceCount}곳</dd></div></dl>
        <div className="candidate-card__footer"><span>최근 확인 {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(player.lastCheckedAt))}</span><Link to={`/players/${player.id}`}>상세 보기</Link></div>
      </article>)}
    </section>
  </div>;
}
