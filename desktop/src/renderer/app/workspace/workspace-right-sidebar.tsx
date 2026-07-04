import type { PointerEvent as ReactPointerEvent } from "react";
import type { ApiClient } from "@/platform/api-client";

import { useCallback, useRef, useState } from "react";

import { WorkspaceToolSurface } from "@/app/workspace/workspace-tool-host";
import { clampWorkspaceRightSidebarWidth } from "@/app/workspace/workspace-ui-store";
import { cn } from "@/platform/utils";

interface WorkspaceRightSidebarProps {
  active?: boolean;
  api: ApiClient;
  chatId: string;
  open: boolean;
  root: string;
  width: number;
  onWidthChange: (width: number) => void;
}

export function WorkspaceRightSidebar({
  active = true,
  api,
  chatId,
  open,
  root,
  width,
  onWidthChange,
}: WorkspaceRightSidebarProps) {
  const resizeStateRef = useRef<{ startWidth: number; startX: number } | null>(
    null,
  );
  const [resizeDraftWidth, setResizeDraftWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const currentWidth = resizeDraftWidth ?? width;
  const widthStyle = { width: open ? currentWidth : 0 };
  const contentStyle = { width: currentWidth };

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const nextDraftWidth = clampWorkspaceRightSidebarWidth(currentWidth);
      setResizeDraftWidth(nextDraftWidth);
      resizeStateRef.current = {
        startWidth: nextDraftWidth,
        startX: event.clientX,
      };
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [currentWidth],
  );
  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      setResizeDraftWidth(
        clampWorkspaceRightSidebarWidth(
          resizeState.startWidth + resizeState.startX - event.clientX,
        ),
      );
    },
    [],
  );
  const handleResizePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (resizeState) {
        const nextWidth = clampWorkspaceRightSidebarWidth(
          resizeState.startWidth + resizeState.startX - event.clientX,
        );
        onWidthChange(nextWidth);
      }
      resizeStateRef.current = null;
      setResizeDraftWidth(null);
      setResizing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [onWidthChange],
  );

  return (
    <aside
      aria-hidden={!open}
      inert={!open ? true : undefined}
      className={cn(
        `
          relative min-h-0 shrink-0 overflow-hidden border-l border-border
          bg-background/80
        `,
        resizing
          ? "transition-opacity"
          : "transition-[width,opacity] duration-200 ease-linear",
        open ? "opacity-100" : "opacity-0",
      )}
      style={widthStyle}
    >
      <div
        aria-hidden="true"
        className="
          absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize
          touch-none
          before:absolute before:inset-y-0 before:left-1/2 before:w-px
          before:-translate-x-1/2 before:bg-transparent
          hover:before:bg-primary/35
        "
        onPointerCancel={handleResizePointerEnd}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerEnd}
      />
      <div className="flex h-full flex-col" style={contentStyle}>
        <WorkspaceToolSurface
          active={active && open}
          api={api}
          chatId={chatId}
          host="sidebar"
          root={root}
        />
      </div>
    </aside>
  );
}
