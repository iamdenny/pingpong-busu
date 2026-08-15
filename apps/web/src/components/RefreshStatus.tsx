import type { SourceComparison } from "@busu/domain";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { CollapsibleContent } from "./CollapsibleContent";

const labels = {
  fresh: "방금 확인",
  refreshing: "조회 중",
  unsupported: "실시간 조회 미지원",
  delayed: "출처 조회 지연",
  parser_attention: "파서 점검 필요",
} as const;

export function RefreshStatus({ sources }: { sources: SourceComparison[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="refresh-panel" aria-labelledby="refresh-title">
      <div className="refresh-panel__heading">
        <div>
          <p className="eyebrow">출처별 상태 · {sources.length}곳</p>
          <h2 id="refresh-title">저장된 기록을 먼저 표시합니다</h2>
        </div>
        <button
          type="button"
          className="source-refresh-progress__toggle"
          aria-controls="player-source-status-details"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          상세 {isExpanded ? "접기" : "보기"}
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </div>
      <CollapsibleContent
        id="player-source-status-details"
        expanded={isExpanded}
      >
        <div className="refresh-panel__details">
          <p className="subtle">
            일부 출처가 실패해도 확인된 기록은 계속 표시됩니다.
          </p>
          <ul>
            {sources.map((source) => (
              <li key={source.sourceCode}>
                <span>
                  <i
                    className={`status-dot status-dot--${source.status}`}
                    aria-hidden="true"
                  />
                  {source.sourceName}
                </span>
                <strong>
                  {source.sourceCode === "band"
                    ? "원문에서 직접 확인"
                    : labels[source.status]}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </section>
  );
}
