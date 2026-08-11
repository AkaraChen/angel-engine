import type { ReactNode } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/platform/utils";

const DEFAULT_COLLAPSED_MAX_HEIGHT = 240;

export function CollapsibleText({
  children,
  className,
  collapsedMaxHeight = DEFAULT_COLLAPSED_MAX_HEIGHT,
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

  useEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  useEffect(() => {
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
    if (expanded && (rootRef.current?.getBoundingClientRect().top ?? 0) < 0) {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setExpanded((current) => !current);
  };

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out"
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
          <Button onClick={toggle} size="xs" variant="ghost">
            {t(expanded ? "common.showLess" : "common.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
