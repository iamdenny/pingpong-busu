import type { SourceCode } from '@busu/domain';

export interface SourceRefreshView {
  sourceCode: SourceCode;
  sourceName: string;
  state: 'waiting' | 'refreshing' | 'succeeded' | 'failed' | 'skipped';
  found?: number;
  inserted?: number;
  updated?: number;
  reason?: string;
}

function stateText(source: SourceRefreshView): string {
  if (source.state === 'waiting') return '조회 대기';
  if (source.state === 'refreshing') return '조회 중';
  if (source.state === 'failed') return '조회 지연';
  if (source.state === 'skipped') return source.reason === 'source_rate_limited' ? '잠시 후 재조회' : '조회 건너뜀';
  const changes = (source.inserted ?? 0) + (source.updated ?? 0);
  return changes > 0 ? `완료 · 신규·변경 ${changes}건` : '완료 · 새 기록 없음';
}

export function SourceRefreshProgress({ sources }: { sources: SourceRefreshView[] }) {
  const completed = sources.filter((source) => !['waiting', 'refreshing'].includes(source.state)).length;
  const refreshing = sources.length - completed;
  const failed = sources.filter((source) => source.state === 'failed' || source.state === 'skipped').length;
  const summary = refreshing > 0
    ? `${sources.length}곳 중 ${completed}곳 완료 · ${refreshing}곳 조회 중`
    : failed > 0
      ? `${sources.length}곳 조회 완료 · ${failed}곳 지연`
      : `${sources.length}곳 조회 완료`;

  return <section className="source-refresh-progress" aria-labelledby="source-refresh-title">
    <div className="source-refresh-progress__heading"><div><p className="eyebrow">실시간 출처 조회</p><h2 id="source-refresh-title">{summary}</h2></div><p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{summary}</p></div>
    <ul role="list">{sources.map((source) => <li key={source.sourceCode}>
      <span><i className={`status-dot status-dot--${source.state === 'succeeded' ? 'fresh' : source.state === 'failed' || source.state === 'skipped' ? 'delayed' : 'refreshing'}`} aria-hidden="true" />{source.sourceName}</span>
      <strong>{stateText(source)}</strong>
    </li>)}</ul>
  </section>;
}
