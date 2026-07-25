import { CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/platform/utils";

/** Tall user messages collapse to this height until the reader expands them. */
export const collapsedMessageBodyMaxHeight = 240;

/**
 * Clamp a message body once it grows past `collapsedMessageBodyMaxHeight` and
 * offer a show more/less toggle. Short messages render untouched, without the
 * toggle.
 */
export function CollapsibleMessageBody({
  children,
  className,
  fadeClassName,
  toggleClassName,
}: {
  children: ReactNode;
  className?: string;
  fadeClassName?: string;
  toggleClassName?: string;
}) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // The measured element is never clamped itself, so its scroll height is the
  // full content height even while the wrapper is collapsed.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      setIsOverflowing(content.scrollHeight > collapsedMessageBodyMaxHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, []);

  const toggle = useCallback(() => {
    setIsExpanded((expanded) => !expanded);
  }, []);

  const isCollapsed = isOverflowing && !isExpanded;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div
        className={cn("relative min-w-0", isCollapsed && "overflow-hidden")}
        style={
          isCollapsed
            ? { maxHeight: `${collapsedMessageBodyMaxHeight}px` }
            : undefined
        }
      >
        <div ref={contentRef}>{children}</div>
        {isCollapsed ? (
          <div
            aria-hidden="true"
            className={cn(
              `
                pointer-events-none absolute inset-x-0 bottom-0 h-10
                bg-linear-to-t from-primary to-transparent
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
              mt-1.5 inline-flex items-center gap-1 self-start rounded-sm
              text-xs font-medium opacity-80 transition-opacity
              hover:opacity-100
            `,
            toggleClassName,
          )}
          onClick={toggle}
          type="button"
        >
          <CaretDown className={cn("size-3", isExpanded && "rotate-180")} />
          {isExpanded ? t("common.showLess") : t("common.showMore")}
        </button>
      ) : null}
    </div>
  );
}
