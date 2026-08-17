import type { EventType } from "@busu/domain";

import {
  excludedAwardScope,
  excludedAwardScopeLabels,
  excludedAwardScopeNote,
} from "../lib/awardScope";

export function ExcludedAwardScopeBadge({
  event,
  eventType,
}: {
  event: string | undefined;
  eventType?: EventType;
}) {
  const scope = excludedAwardScope({
    event,
    ...(eventType ? { eventType } : {}),
  });
  if (!scope) return null;
  return (
    <span
      className="result-scope-badge"
      data-scope={scope}
      title={excludedAwardScopeNote}
    >
      {excludedAwardScopeLabels[scope]}
    </span>
  );
}
