import type {
  DivisionSummaryGroup,
  DivisionSummaryItem,
} from "../lib/divisionSummary";

export interface DivisionOverviewSection {
  key: string;
  label: string;
  isAssigned: boolean;
  groups: DivisionSummaryGroup[];
}

export interface DivisionOverviewProps<
  TSection extends DivisionOverviewSection,
> {
  titleId: string;
  title: string;
  description: string;
  sections: readonly TSection[];
  showsSectionHeadings?: boolean;
  isSelected?: (section: TSection, summary: DivisionSummaryItem) => boolean;
  onSelect?: (section: TSection, summary: DivisionSummaryItem) => void;
  selectionTargetId?: string;
}

function countsLabel(summary: DivisionSummaryItem): string {
  return `입상 ${summary.awardCount}건 참가 ${summary.participationCount}건`;
}

function DivisionCounts({ summary }: { summary: DivisionSummaryItem }) {
  return (
    <>
      <strong>{summary.division}</strong>
      <span className="division-overview__counts">
        <span
          className={
            summary.awardCount > 0
              ? "division-overview__award-count--positive"
              : undefined
          }
        >
          입상 <b>{summary.awardCount}건</b>
        </span>
        <span>
          참가 <b>{summary.participationCount}건</b>
        </span>
      </span>
    </>
  );
}

export function DivisionOverview<TSection extends DivisionOverviewSection>({
  titleId,
  title,
  description,
  sections,
  showsSectionHeadings = false,
  isSelected,
  onSelect,
  selectionTargetId,
}: DivisionOverviewProps<TSection>) {
  if (!sections.some((section) => section.groups.length > 0)) return null;

  return (
    <section
      className={`division-overview${showsSectionHeadings ? " division-overview--grouped" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="division-overview__heading">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="division-overview__sections">
        {sections.map((section, sectionIndex) => {
          const headingId = `${titleId}-section-${sectionIndex}`;
          return (
            <div className="division-overview__section" key={section.key}>
              {showsSectionHeadings && (
                <div className="division-overview__identity-heading">
                  <h3 id={headingId}>{section.label}</h3>
                  <span>
                    {section.isAssigned
                      ? "별칭으로 연결된 기록"
                      : "아직 별칭이 없는 기록"}
                  </span>
                </div>
              )}
              <div className="division-overview__table-wrap">
                <table
                  aria-labelledby={showsSectionHeadings ? headingId : undefined}
                >
                  <caption className="visually-hidden">
                    {showsSectionHeadings ? `${section.label}의 ` : ""}
                    부수 체계별 최근 관측 부수와 입상 및 참가 기록 수
                  </caption>
                  <colgroup>
                    <col className="division-overview__system-column" />
                    <col />
                  </colgroup>
                  <tbody>
                    {section.groups.flatMap((group) =>
                      group.rows.map((row, rowIndex) => (
                        <tr
                          key={`${group.system}-${row.kind}`}
                          className={`division-overview__subrow division-overview__subrow--${row.kind}`}
                        >
                          {rowIndex === 0 && (
                            <th scope="row" rowSpan={group.rows.length}>
                              {group.systemLabel}
                            </th>
                          )}
                          <td>
                            <span className="visually-hidden">
                              {group.systemLabel} {row.label}
                            </span>
                            <ul className="division-overview__items">
                              {row.items.map((summary) => (
                                <li
                                  key={`${summary.system}-${summary.division}`}
                                >
                                  {onSelect ? (
                                    <button
                                      type="button"
                                      className="division-overview__filter"
                                      aria-controls={selectionTargetId}
                                      aria-pressed={
                                        isSelected?.(section, summary) ?? false
                                      }
                                      aria-label={`${showsSectionHeadings ? `${section.label}, ` : ""}${summary.systemLabel} ${summary.division} ${countsLabel(summary)} 결과 보기`}
                                      onClick={() => onSelect(section, summary)}
                                    >
                                      <DivisionCounts summary={summary} />
                                    </button>
                                  ) : (
                                    <span className="division-overview__item">
                                      <span className="visually-hidden">
                                        {summary.systemLabel} {summary.division}{" "}
                                        {countsLabel(summary)}
                                      </span>
                                      <span aria-hidden="true">
                                        <DivisionCounts summary={summary} />
                                      </span>
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
