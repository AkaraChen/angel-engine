import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/platform/utils";

/** ~12 lines of text-xs (12px * 1.5 line-height). */
export const defaultCollapsedTextMaxHeight = 216;

type CollapsibleTextProps = {
  children: ReactNode;
  className?: string;
  collapsedMaxHeight?: number;
  fadeClassName?: string;
  /** Remount/reset expanded state when this changes (e.g. PR number + thread id). */
  resetKey?: string | number;
  toggleClassName?: string;
};

/**
 * Clamp tall text blocks with a bottom fade and a Load more / Show less control.
 * Short content renders without the toggle.
 */
export function CollapsibleText({
  children,
  className,
  collapsedMaxHeight = defaultCollapsedTextMaxHeight,
  fadeClassName,
  resetKey,
  toggleClassName,
}: CollapsibleTextProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset expansion when the logical document (PR / thread) changes.
  useLayoutEffect(() => {
    setIsExpanded(false);
  }, [resetKey]);

  // Measure the unclamped content so short bodies never show a useless toggle.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      setIsOverflowing(content.scrollHeight > collapsedMaxHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [collapsedMaxHeight, resetKey]);

  const isCollapsed = isOverflowing && !isExpanded;

  const toggle = () => {
    if (isExpanded) {
      setIsExpanded(false);
      // Keep the block in view when collapsing long content.
      window.requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
      return;
    }
    setIsExpanded(true);
  };

  return (
    <div className={cn("flex min-w-0 flex-col", className)} ref={rootRef}>
      <div
        className={cn("relative min-w-0", isCollapsed && "overflow-hidden")}
        data-collapsed={isCollapsed ? "true" : "false"}
        data-testid="collapsible-text"
        style={
          isCollapsed
            ? {
                maxHeight: `${collapsedMaxHeight}px`,
                transition: "max-height 200ms ease",
              }
            : { transition: "max-height 200ms ease" }
        }
      >
        <div ref={contentRef}>{children}</div>
        {isCollapsed ? (
          <div
            aria-hidden="true"
            className={cn(
              `
                pointer-events-none absolute inset-x-0 bottom-0 h-10
                bg-linear-to-t from-background to-transparent
              `,
              fadeClassName,
            )}
          />
        ) : null}
      </div>
      {isOverflowing ? (
        <button
          aria-expanded={isExpanded}
          className={cn(
            `
              mt-1.5 self-center rounded-sm px-1 text-xs font-medium
              text-muted-foreground transition-colors
              hover:text-foreground
            `,
            toggleClassName,
          )}
          data-testid="collapsible-text-toggle"
          onClick={toggle}
          type="button"
        >
          {isExpanded ? t("common.showLess") : t("common.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
