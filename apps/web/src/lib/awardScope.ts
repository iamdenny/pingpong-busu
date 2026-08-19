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

export const mixedGenderScaleNote =
  "혼성 종목에서 매긴 부수라 여자부수와 번호 기준이 다를 수 있습니다.";

/**
 * 혼성·혼합 종목은 여자부수가 아니라 그 종목 기준으로 부수를 매긴다. 같은
 * 선수가 같은 날 여자6부와 혼성8부를 함께 받는 사례가 있어, 화면에서 두 값을
 * 같은 척도로 읽지 않도록 표시한다.
 */
export function isMixedGenderEvent(event: string | undefined): boolean {
  return /혼성|혼합|\(혼\)/u.test((event ?? "").normalize("NFKC"));
}
