import { useEffect } from "react";
import { useAnimate } from "motion/react-mini";

const calmEase = [0.22, 1, 0.36, 1] as const;

export function useCalmEntry(selector: string, changeKey: string = "initial") {
  const [scope, animate] = useAnimate();

  useEffect(() => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const root = scope.current as HTMLElement | null;
    const elements = root?.querySelectorAll(selector) ?? [];
    Array.from(elements).forEach((element, index) => {
      if (typeof (element as HTMLElement).animate !== "function") return;
      void animate(
        element,
        { opacity: [0, 1], transform: ["translateY(8px)", "none"] },
        {
          delay: Math.min(index, 5) * 0.035,
          duration: 0.2,
          ease: calmEase,
        },
      );
    });
  }, [animate, changeKey, scope, selector]);

  return scope;
}
