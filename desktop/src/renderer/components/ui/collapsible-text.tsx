import type { ReactNode } from "react";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/platform/utils";

/** ~12 lines of text-xs. */
export const defaultCollapsedTextMaxHeight = 240;

export function CollapsibleText({
  children,
  className,
  collapsedMaxHeight = defaultCollapsedTextMaxHeight,
  resetKey,
  text,
}: {
  children?: ReactNode;
  className?: string;
  collapsedMaxHeight?: number;
  resetKey?: number | string;
  text?: string;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const overflowing = contentHeight > collapsedMaxHeight + 1;

  const measure = useCallback(() => {
    setContentHeight(contentRef.current?.scrollHeight ?? 0);
  }, []);

  // Switching PR / thread resets to collapsed.
  useLayoutEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  // Measure unclamped content height; re-run when content changes or resizes.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content === null) {
      return;
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [children, measure, text]);

  const toggle = () => {
    if (expanded) {
      setExpanded(false);
      // Always align the block top after collapse. `nearest` can no-op when the
      // block is still partially visible, leaving the viewport mid-body.
      window.requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }
    setExpanded(true);
  };

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out"
        data-collapsed={overflowing && !expanded ? "true" : "false"}
        data-testid="collapsible-text-content"
        style={{
          maxHeight: overflowing
            ? expanded
              ? `${contentHeight}px`
              : `${collapsedMaxHeight}px`
            : undefined,
        }}
      >
        <div ref={contentRef}>{text ?? children}</div>
      </div>
      {overflowing ? (
        <div className="relative flex justify-center pt-1">
          {!expanded ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-full h-12 bg-linear-to-t from-background via-background/90 to-transparent" />
          ) : null}
          <Button
            data-testid="collapsible-text-toggle"
            onClick={toggle}
            size="xs"
            variant="ghost"
          >
            {t(expanded ? "common.showLess" : "common.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
