import { useQuery } from '@tanstack/react-query';
import { Database, ScanSearch, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SearchForm } from '../components/SearchForm';
import { playerRepository } from '../lib/runtime';

const statusText = (sourceCode: string, enabled: boolean, adapterMode: 'http' | 'browser' | 'manual'): string => {
  if (enabled) return '검색 중';
  if (adapterMode === 'manual') return '원문 수동 확인';
  if (sourceCode === 'iping') return '로그인 필요 · 자동수집 안 함';
  if (sourceCode === 'yongintt') return '무료 API 키 설정 필요';
  if (sourceCode === 'airping' || sourceCode === 'okpingpong') return '운영 설정 필요';
  return '연동 준비 중';
};

export function HomePage() {
  const navigate = useNavigate();
  const sources = useQuery({ queryKey: ['source-statuses'], queryFn: () => playerRepository.listSourceStatuses(), staleTime: 5 * 60 * 1000 });
  const activeSourceCount = sources.data?.filter((source) => source.enabled).length ?? 0;
  return <div className="home-page">
    <section className="hero"><p className="eyebrow">탁구 기록, 근거부터 확인하세요</p><h1>전국 탁구 선수<br /><span>부수·입상 통합조회</span></h1><p className="hero__description">여러 대회 사이트의 저장된 기록을 먼저 보고, 출처별 차이와 마지막 확인 시각을 함께 비교합니다.</p><SearchForm onSearch={(query) => navigate(`/search?q=${encodeURIComponent(query)}`)} /><div className="examples">예시 검색어: <button onClick={() => navigate('/search?q=김탁구')}>김탁구</button><button onClick={() => navigate('/search?q=이라켓')}>이라켓</button></div></section>
    {sources.data && <details className="source-overview">
      <summary><span className="source-overview__summary"><strong>검색 출처</strong><small>{activeSourceCount}곳 검색 중 · 전체 {sources.data.length}곳</small></span><span className="source-overview__action">상세</span></summary>
      <div className="source-overview__content"><p>활성 출처는 검색할 때 최신 공개 기록을 확인합니다.</p>
        <ul role="list">{sources.data.map((source) => <li key={source.sourceCode}><span className={`source-state source-state--${source.enabled ? 'active' : source.adapterMode}`} aria-hidden="true" /><span className="source-overview__source"><strong>{source.displayName}</strong><a href={source.baseUrl} target="_blank" rel="noreferrer" aria-label={`${source.displayName} 사이트 열기`}>{source.baseUrl}</a></span><small>{statusText(source.sourceCode, source.enabled, source.adapterMode)}</small></li>)}</ul>
      </div>
    </details>}
    <section className="benefits" aria-label="서비스 특징"><article><Database /><h2>여러 사이트 통합조회</h2><p>흩어진 기록을 출처와 함께 한 화면에서 확인합니다.</p></article><article><Users /><h2>동명이인 구분</h2><p>이름이 같아도 소속과 지역별 후보를 따로 표시합니다.</p></article><article><ScanSearch /><h2>대회 기록 근거 확인</h2><p>관측 부수와 입상 결과의 원문 근거를 연결합니다.</p></article></section>
    <aside className="notice"><strong>안내</strong><p>BUSU는 공식 판정 서비스가 아닙니다. 표시된 부수는 해당 대회 기록에서 관측된 값입니다.</p></aside>
  </div>;
}
