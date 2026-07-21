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
  trailingActions,
  trafficLightInset,
  onRequestHost,
}: {
  host: WorkspaceToolSurfaceHost;
  root?: string | null;
  trailingActions?: ReactNode;
  trafficLightInset: boolean;
  onRequestHost: (host: WorkspaceToolSurfaceHost) => void;
}) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 px-3",
        host === "sidebar" &&
          "[&_button]:size-[32px]! [&_button_svg]:size-[16px]!",
        host !== "sidebar" && "border-b border-border-subtle",
        trafficLightInset && "pl-[88px]",
      )}
      data-electron-drag={trafficLightInset ? true : undefined}
    >
      {host === "sidebar" ? (
        <div className="flex-1" />
      ) : (
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          {is.nonEmptyString(root)
            ? workspaceToolRootName(root)
            : "Angel Engine"}
        </div>
      )}
      <WorkspaceToolSurfaceHostControls
        host={host}
        onRequestHost={onRequestHost}
      />
      {trailingActions}
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
        <WorkspaceToolHeaderButton
          icon={<DockIcon weight="duotone" />}
          label="Dock in sidebar"
          onClick={() => onRequestHost("sidebar")}
        />
      ) : null}
      {host !== "window" ? (
        <WorkspaceToolHeaderButton
          icon={<WindowIcon weight="duotone" />}
          label="Open in window"
          onClick={() => onRequestHost("window")}
        />
      ) : null}
    </>
  );
}

export function WorkspaceToolHeaderButton({
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
          className="text-muted-foreground"
          data-electron-no-drag
          onClick={onClick}
          size="icon-sm"
          title={label}
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
