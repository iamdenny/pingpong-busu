import { isIndividualDivisionRecord, type EventType } from "@busu/domain";

export type ExcludedAwardScope = "team" | "doubles" | "mixed";

export const excludedAwardScopeLabels: Record<ExcludedAwardScope, string> = {
  team: "단체",
  doubles: "복식",
  mixed: "혼성",
};

export const excludedAwardScopeNote =
  "단체·복식·혼성 입상은 현재 추정 부수 집계에서 제외합니다.";

/**
 * 현재 추정 부수는 개인전 기록만 집계하므로, 화면에 남는 입상 기록에는 어떤
 * 종목이라 제외됐는지 표시한다. 판정 규칙은 서버의
 * `is_individual_division_record`와 같다.
 */
export function excludedAwardScope(
  record: Readonly<{
    event?: string | undefined;
    eventType?: EventType | undefined;
  }>,
): ExcludedAwardScope | undefined {
  const individual = isIndividualDivisionRecord({
    ...(record.event === undefined ? {} : { event: record.event }),
    ...(record.eventType === undefined ? {} : { eventType: record.eventType }),
  });
  if (individual) return undefined;
  const event = (record.event ?? "").normalize("NFKC");
  if (record.eventType === "team" || /단체/u.test(event)) return "team";
  if (record.eventType === "doubles" || /복식/u.test(event)) return "doubles";
  return "mixed";
}
