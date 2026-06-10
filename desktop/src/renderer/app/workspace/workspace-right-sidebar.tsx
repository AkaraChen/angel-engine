import type { ApiClient } from "@/platform/api-client";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useCallback, useEffect, useRef, useState } from "react";

import { WorkspaceToolSurface } from "@/app/workspace/workspace-tool-host";
import { clampWorkspaceRightSidebarWidth } from "@/app/workspace/workspace-ui-store";
import { cn } from "@/platform/utils";

interface WorkspaceRightSidebarProps {
  api: ApiClient;
  chatId: string;
  open: boolean;
  root: string;
  width: number;
  onWidthChange: (width: number) => void;
}

export function WorkspaceRightSidebar({
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
  const [draftWidth, setDraftWidth] = useState(width);
  const [resizing, setResizing] = useState(false);
  const widthStyle = { width: open ? draftWidth : 0 };
  const contentStyle = { width: draftWidth };

  useEffect(() => {
    if (!resizeStateRef.current) {
      setDraftWidth(width);
    }
  }, [width]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const nextDraftWidth = clampWorkspaceRightSidebarWidth(draftWidth);
      setDraftWidth(nextDraftWidth);
      resizeStateRef.current = {
        startWidth: nextDraftWidth,
        startX: event.clientX,
      };
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [draftWidth],
  );
  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      setDraftWidth(
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
        setDraftWidth(nextWidth);
        onWidthChange(nextWidth);
      }
      resizeStateRef.current = null;
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
        "relative min-h-0 shrink-0 overflow-hidden border-l border-foreground/10 bg-background/80 dark:border-white/10",
        resizing
          ? "transition-opacity"
          : "transition-[width,opacity] duration-200 ease-linear",
        open ? "opacity-100" : "opacity-0",
      )}
      style={widthStyle}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent hover:before:bg-primary/35"
        onPointerCancel={handleResizePointerEnd}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerEnd}
      />
      <div className="flex h-full flex-col" style={contentStyle}>
        <WorkspaceToolSurface
          api={api}
          chatId={chatId}
          host="sidebar"
          root={root}
        />
      </div>
    </aside>
  );
}
