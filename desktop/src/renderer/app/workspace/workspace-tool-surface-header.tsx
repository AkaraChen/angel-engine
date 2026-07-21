import type { WorkspaceToolSurfaceHost } from "@shared/workspace-tool-surface";
import type { ReactNode } from "react";
import type { ApiClient } from "@/platform/api-client";

import {
  FolderOpen,
  GitBranch,
  AppWindow as WindowIcon,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { workspaceToolRootName } from "@/app/workspace/workspace-file-display";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { queryKeys } from "@/platform/query-keys";

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

export function WorkspaceToolSidebarHeader({
  api,
  root,
  trailingActions,
  onRequestHost,
}: {
  api: ApiClient;
  root?: string | null;
  trailingActions?: ReactNode;
  onRequestHost: (host: WorkspaceToolSurfaceHost) => void;
}) {
  return (
    <div
      className="
        flex h-12 shrink-0 items-center gap-2 px-3
        [&_button]:size-[32px]!
        [&_button_svg]:size-[16px]!
      "
    >
      <WorkspaceToolContextLabel api={api} root={root} />
      <WorkspaceToolHeaderButton
        icon={<WindowIcon weight="duotone" />}
        label="Open in window"
        onClick={() => onRequestHost("window")}
      />
      {trailingActions}
    </div>
  );
}

function WorkspaceToolContextLabel({
  api,
  root,
}: {
  api?: ApiClient;
  root?: string | null;
}) {
  const hasRoot = is.nonEmptyString(root);
  const branchQuery = useQuery({
    enabled: api !== undefined && hasRoot,
    queryFn: async () => {
      if (api === undefined || !hasRoot) {
        throw new Error("Workspace git branch query requires an api and root.");
      }
      return api.workspaceTools.gitDiff({ root });
    },
    queryKey: queryKeys.workspaceTools.gitDiff(hasRoot ? root : ""),
    retry: false,
    select: (data) => (data.isGitRepository ? data.branch : undefined),
    staleTime: 5_000,
  });
  const branch = branchQuery.data;
  const showBranch = is.nonEmptyString(branch);
  const LabelIcon = showBranch ? GitBranch : FolderOpen;
  const label = showBranch
    ? branch
    : hasRoot
      ? workspaceToolRootName(root)
      : "Workspace";

  return (
    <div
      className="
        flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium
        text-muted-foreground
      "
    >
      <LabelIcon
        aria-hidden="true"
        className="size-3.5 shrink-0"
        weight="duotone"
      />
      <span className="truncate" title={showBranch ? branch : undefined}>
        {label}
      </span>
    </div>
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
