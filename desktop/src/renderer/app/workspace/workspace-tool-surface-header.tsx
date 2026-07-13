import type { WorkspaceToolSurfaceHost } from "@shared/workspace-tool-surface";
import type { ReactNode } from "react";

import {
  SidebarSimple as DockIcon,
  AppWindow as WindowIcon,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useEffect } from "react";

import { workspaceToolRootName } from "@/app/workspace/workspace-file-display";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/platform/utils";

export function WorkspaceToolWindowTitleBridge({
  root,
}: {
  root?: string | null;
}) {
  useEffect(() => {
    const rootName = is.nonEmptyString(root)
      ? workspaceToolRootName(root)
      : undefined;
    document.title = is.nonEmptyString(rootName) ? rootName : "Angel Engine";
  }, [root]);

  return null;
}

export function WorkspaceToolSurfaceHeader({
  host,
  root,
  trafficLightInset,
  onRequestHost,
}: {
  host: WorkspaceToolSurfaceHost;
  root?: string | null;
  trafficLightInset: boolean;
  onRequestHost: (host: WorkspaceToolSurfaceHost) => void;
}) {
  return (
    <div
      className={cn(
        `
          flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle
          px-3
        `,
        trafficLightInset && "pl-[88px]",
      )}
      data-electron-drag={trafficLightInset ? true : undefined}
    >
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        {is.nonEmptyString(root) ? workspaceToolRootName(root) : "Angel Engine"}
      </div>
      <WorkspaceToolSurfaceHostControls
        host={host}
        onRequestHost={onRequestHost}
      />
    </div>
  );
}

export function WorkspaceToolSurfaceHostControls({
  host,
  onRequestHost,
}: {
  host: WorkspaceToolSurfaceHost;
  onRequestHost: (host: WorkspaceToolSurfaceHost) => void;
}) {
  return (
    <>
      {host !== "sidebar" ? (
        <WorkspaceToolSurfaceHostButton
          icon={<DockIcon weight="duotone" />}
          label="Dock in sidebar"
          onClick={() => onRequestHost("sidebar")}
        />
      ) : null}
      {host !== "window" ? (
        <WorkspaceToolSurfaceHostButton
          icon={<WindowIcon weight="duotone" />}
          label="Open in window"
          onClick={() => onRequestHost("window")}
        />
      ) : null}
    </>
  );
}

function WorkspaceToolSurfaceHostButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="
            text-muted-foreground
            active:bg-overlay-active
          "
          data-electron-no-drag
          onClick={onClick}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
