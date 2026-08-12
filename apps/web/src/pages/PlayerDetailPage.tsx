import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { displayDivisionValue, divisionSystemLabels, formatDivisionObservation, isAwardRank, sortPlayerRecordsByLatest } from '@busu/domain';
import { RefreshStatus } from '../components/RefreshStatus';
import { SourceComparison } from '../components/SourceComparison';
import { playerRepository } from '../lib/runtime';

type Tab = 'history' | 'awards' | 'sources' | 'rules';

function searchQueryFromState(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('searchQuery' in value)) return undefined;
  return typeof value.searchQuery === 'string' && value.searchQuery.trim() ? value.searchQuery : undefined;
}

export function PlayerDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>('history');
  const result = useQuery({ queryKey: ['player', id], queryFn: () => playerRepository.getPlayer(id) });
  if (result.isLoading) return <div className="page" aria-live="polite">선수 상세를 불러오는 중입니다.</div>;
  if (!result.data) return <div className="page empty-state"><h1>선수를 찾을 수 없습니다.</h1><Link to="/">홈으로</Link></div>;
  const player = result.data;
  const visibleRecords = tab === 'awards' ? player.records.filter((record) => isAwardRank(record.rank)) : player.records;
  const records = sortPlayerRecordsByLatest(visibleRecords);
  const integratedSource = player.sources.find((source) => source.recentObservedDivisionSystem === 'integrated' || source.recentObservedDivisionSystem === 'women');
  const returnQuery = searchQueryFromState(location.state) ?? player.name;
  return <div className="page detail-page">
    <Link className="back-link" to={`/search?q=${encodeURIComponent(returnQuery)}`}><ArrowLeft size={18} /> 검색 결과로</Link>
    <header className="player-header"><div><p className="eyebrow">선수 기록 · {player.dataKind === 'live' ? '수집된 공개 기록' : '가상 데이터'}</p><h1>{player.name}</h1><p>{player.region ? `${player.dataKind === 'live' ? '기록 기반 지역 추정 · ' : ''}${player.region}` : '지역 미상'} · {player.club ?? '소속 미상'}</p></div><span className="identity identity--likely">{player.identityStatus === 'verified' ? '동일인 확인됨' : '소속·지역 확인 필요'}</span></header>
    <section className="division-summary"><article><span>최근 관측 부수</span><strong>{formatDivisionObservation(player.recentObservedDivisionSystem, player.recentObservedDivision)}</strong><small>해당 대회 기록 기준</small></article><article><span>통합부수 기록</span><strong>{formatDivisionObservation(integratedSource?.recentObservedDivisionSystem, integratedSource?.recentObservedDivision)}</strong><small>일반 시·군·구 대회와 여자 종목 포함</small></article><article><span>과거 입상 기록</span><strong>{player.resultCount}건</strong><small>4강 이상 · {player.dataKind === 'live' ? '수집된 공개 기록' : '가상 출처 포함'}</small></article></section>
    <RefreshStatus sources={player.sources} />
    <nav className="tabs" aria-label="선수 상세 항목">{([['history', '전체 이력'], ['awards', '입상 이력 (4강 이상)'], ['sources', '출처 비교'], ['rules', '대회 부수검증']] as const).map(([key, label]) => <button key={key} aria-selected={tab === key} role="tab" onClick={() => setTab(key)}>{label}</button>)}</nav>
    {(tab === 'history' || tab === 'awards') && <section aria-labelledby="history-title"><h2 id="history-title" className="visually-hidden">대회 이력</h2><div className="record-table-wrap"><table><caption>{player.name} 선수의 대회 기록 · 최신순</caption><thead><tr><th>날짜</th><th>대회·종목</th><th>당시 소속</th><th>당시 부수</th><th>결과</th><th>출처</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{record.date ? <time dateTime={record.date}>{record.date}{record.dateBasis === 'published' && <small>게시일</small>}</time> : '날짜 미상'}</td><td><strong>{record.tournament}</strong><small>{record.event}</small></td><td>{record.club ?? '-'}</td><td>{record.divisionSystem ? <small>{divisionSystemLabels[record.divisionSystem]}</small> : null}{displayDivisionValue(record.divisionSystem, record.division ?? '-')}</td><td>{record.rank ?? '-'}</td><td><a href={record.sourceUrl} target="_blank" rel="noreferrer">{record.sourceName}<ExternalLink size={14} /></a></td></tr>)}</tbody></table></div><div className="record-cards">{records.map((record) => <article key={record.id}>{record.date ? <time dateTime={record.date}>{record.date}{record.dateBasis === 'published' && ' · 게시일'}</time> : <span className="record-date-unknown">날짜 미상</span>}<h3>{record.tournament}</h3><p>{record.event} · {record.club}</p><dl><div><dt>당시 부수</dt><dd>{formatDivisionObservation(record.divisionSystem, record.division ?? '-')}</dd></div><div><dt>결과</dt><dd>{record.rank ?? '-'}</dd></div></dl><a href={record.sourceUrl} target="_blank" rel="noreferrer">{record.sourceName} 원문 <ExternalLink size={14} /></a></article>)}</div></section>}
    {tab === 'sources' && <SourceComparison sources={player.sources} />}
    {tab === 'rules' && <section className="empty-state"><span className="badge">준비 중</span><h2>대회 부수검증</h2><p>대회별 규정을 적용한 최소 출전 가능 부수를 근거와 함께 보여줄 예정입니다. 자동 확정 판정이 아닙니다.</p></section>}
  </div>;
}
