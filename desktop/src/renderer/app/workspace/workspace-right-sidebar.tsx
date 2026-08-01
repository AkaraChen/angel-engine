import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { WorkspaceToolSurfaceHost } from "@shared/workspace-tool-surface";
import type { ApiClient } from "@/platform/api-client";

import { SidebarSimple as SidebarFold } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";

import { WorkspaceToolSurface } from "@/app/workspace/workspace-tool-host";
import {
  WorkspaceToolHeaderButton,
  WorkspaceToolSidebarHeader,
} from "@/app/workspace/workspace-tool-surface-header";
import {
  clampWorkspaceRightSidebarWidth,
  defaultWorkspaceRightSidebarWidth,
  maxWorkspaceRightSidebarWidth,
  minWorkspaceRightSidebarWidth,
} from "@/app/workspace/workspace-ui-store";
import { cn } from "@/platform/utils";

interface WorkspaceRightSidebarProps {
  active?: boolean;
  api: ApiClient;
  contextKey: string;
  open: boolean;
  root: string;
  width: number;
  onClose: () => void;
  onRequestHost: (host: WorkspaceToolSurfaceHost) => void;
  onWidthChange: (width: number) => void;
}

export function WorkspaceRightSidebar({
  active = true,
  api,
  contextKey,
  open,
  root,
  width,
  onClose,
  onRequestHost,
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
  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        onWidthChange(clampWorkspaceRightSidebarWidth(width + 16));
      } else if (event.key === "ArrowRight") {
        onWidthChange(clampWorkspaceRightSidebarWidth(width - 16));
      } else if (event.key === "Home") {
        onWidthChange(minWorkspaceRightSidebarWidth);
      } else if (event.key === "End") {
        onWidthChange(maxWorkspaceRightSidebarWidth);
      } else {
        return;
      }
      event.preventDefault();
    },
    [onWidthChange, width],
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
      // Same visual language as the left sidebar: one hairline where it meets
      // the content area, and no other border or shadow inside it.
      className={cn(
        `
          relative h-svh min-h-0 max-h-svh shrink-0 overflow-hidden
          bg-background
        `,
        open && "border-l border-border-subtle",
        resizing
          ? "transition-none"
          : `
            transition-[width] duration-200 ease-standard
            motion-reduce:transition-none
          `,
      )}
      style={widthStyle}
    >
      <div className="flex h-full flex-col" style={contentStyle}>
        <WorkspaceToolSidebarHeader
          api={api}
          root={root}
          trailingActions={
            <WorkspaceToolHeaderButton
              icon={<SidebarFold className="scale-x-[-1]" />}
              label="Hide workspace tools"
              onClick={onClose}
            />
          }
          onRequestHost={onRequestHost}
        />
        <div className="relative min-h-0 flex-1">
          <div
            aria-label="Resize tool sidebar"
            aria-orientation="vertical"
            aria-valuemax={maxWorkspaceRightSidebarWidth}
            aria-valuemin={minWorkspaceRightSidebarWidth}
            aria-valuenow={currentWidth}
            role="separator"
            tabIndex={0}
            className="
              absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2
              cursor-col-resize touch-none outline-none
            "
            onDoubleClick={() =>
              onWidthChange(defaultWorkspaceRightSidebarWidth)
            }
            onKeyDown={handleResizeKeyDown}
            onPointerCancel={handleResizePointerEnd}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
          />
          <div className="flex h-full min-h-0 overflow-hidden">
            <WorkspaceToolSurface
              active={active && open}
              api={api}
              contextKey={contextKey}
              host="sidebar"
              root={root}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
