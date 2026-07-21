import type { Icon } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";

import is from "@sindresorhus/is";
import { useCallback, useRef, useState } from "react";

import { cn } from "@/platform/utils";

export type WorkspaceToolCssVariableStyle = CSSProperties &
  Record<`--${string}`, string | number>;

export const workspaceToolFileTreeWidthStorageKey =
  "angel-engine.workspace-tool-file-tree-width";
export const workspaceToolFileTreeWidthMin = 200;
export const workspaceToolFileTreeWidthMax = 520;
export const workspaceToolGitListWidthStorageKey =
  "angel-engine.workspace-tool-git-list-width";
export const workspaceToolGitListWidthMin = 240;
export const workspaceToolGitListWidthMax = 520;

function readStoredWorkspaceToolPanelWidth({
  fallback,
  key,
  max,
  min,
}: {
  fallback: number;
  key: string;
  max: number;
  min: number;
}) {
  const raw = window.localStorage.getItem(key);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export const initialWorkspaceToolFileTreeWidth =
  readStoredWorkspaceToolPanelWidth({
    fallback: 288,
    key: workspaceToolFileTreeWidthStorageKey,
    max: workspaceToolFileTreeWidthMax,
    min: workspaceToolFileTreeWidthMin,
  });
export const initialWorkspaceToolGitListWidth =
  readStoredWorkspaceToolPanelWidth({
    fallback: 320,
    key: workspaceToolGitListWidthStorageKey,
    max: workspaceToolGitListWidthMax,
    min: workspaceToolGitListWidthMin,
  });

export function WorkspaceToolPanelSplitter({
  ariaLabel,
  max,
  min,
  onChange,
  value,
}: {
  ariaLabel: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const [resizing, setResizing] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startWidth: number;
    startX: number;
  } | null>(null);
  const clampWidth = useCallback(
    (next: number) => Math.min(max, Math.max(min, next)),
    [max, min],
  );
  const endResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    setResizing(false);
  }, []);

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={cn(
        `
          relative w-1 shrink-0 cursor-col-resize touch-none outline-none
          before:absolute before:inset-y-0 before:left-1/2 before:w-px
          before:-translate-x-1/2
        `,
        resizing
          ? "before:bg-primary"
          : `
            before:bg-border-subtle
            hover:before:bg-border-strong
            focus-visible:before:bg-primary
          `,
      )}
      onKeyDown={(event) => {
        let next: number | null = null;
        if (event.key === "ArrowLeft") {
          next = value - 16;
        } else if (event.key === "ArrowRight") {
          next = value + 16;
        } else if (event.key === "Home") {
          next = min;
        } else if (event.key === "End") {
          next = max;
        }
        if (next === null) {
          return;
        }
        event.preventDefault();
        onChange(clampWidth(next));
      }}
      onPointerCancel={endResize}
      onPointerDown={(event) => {
        event.preventDefault();
        dragStateRef.current = {
          pointerId: event.pointerId,
          startWidth: value,
          startX: event.clientX,
        };
        setResizing(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const dragState = dragStateRef.current;
        if (dragState?.pointerId !== event.pointerId) {
          return;
        }
        onChange(
          clampWidth(dragState.startWidth + event.clientX - dragState.startX),
        );
      }}
      onPointerUp={endResize}
      role="separator"
      tabIndex={0}
    />
  );
}

export function WorkspaceToolEmpty({
  detail,
  icon: EmptyIcon,
  title,
}: {
  detail?: string;
  icon?: Icon;
  title: string;
}) {
  return (
    <div
      className="
        flex h-full min-h-0 items-center justify-center p-4 text-center
      "
    >
      <div className="flex max-w-80 flex-col items-center gap-1">
        {EmptyIcon === undefined ? null : (
          <EmptyIcon
            aria-hidden="true"
            className="mb-1 size-7 text-muted-foreground/60"
            weight="duotone"
          />
        )}
        <div className="text-sm font-medium">{title}</div>
        {is.nonEmptyString(detail) ? (
          <div
            className="
              text-xs wrap-break-word text-muted-foreground select-text
            "
          >
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WorkspaceToolBanner({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone: "attention" | "danger";
}) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-md border px-2.5 py-2 text-xs select-text",
        tone === "attention"
          ? `
            border-status-attention-border bg-status-attention-soft
            text-muted-foreground
          `
          : `
            border-status-danger-border bg-status-danger-soft
            text-status-danger
          `,
        className,
      )}
    >
      {children}
    </div>
  );
}
