import type { ReactNode } from "react";

export function CollapsibleContent({
  children,
  expanded,
  id,
}: {
  children: ReactNode;
  expanded: boolean;
  id: string;
}) {
  return (
    <div
      id={id}
      className="collapsible-content"
      data-expanded={expanded}
      aria-hidden={!expanded}
      inert={!expanded}
    >
      <div className="collapsible-content__inner">{children}</div>
    </div>
  );
}
