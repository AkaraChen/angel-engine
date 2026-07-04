import type { ReactNode } from "react";
import type { ChatAttentionState } from "@/features/chat/state/chat-run-store";

import {
  RiSidebarFoldLine as SidebarFold,
  RiSidebarUnfoldLine as SidebarUnfold,
} from "@remixicon/react";
import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import { WorkspaceSidebarControlTarget } from "@/app/workspace/workspace-sidebar-control";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WorkspaceHeaderProps {
  attention?: ChatAttentionState;
  breadcrumbProject?: string;
  onToggleRightSidebar?: () => void;
  rightSidebarOpen?: boolean;
  rightSidebarToggleLabel?: string;
  running?: boolean;
  title: string;
  workspaceToolActions?: ReactNode;
}

export function WorkspaceHeader({
  attention,
  breadcrumbProject,
  onToggleRightSidebar,
  rightSidebarOpen = false,
  rightSidebarToggleLabel = "Toggle workspace tools",
  running = false,
  title,
  workspaceToolActions,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation();
  const { isMobile, state } = useSidebar();
  const showAttention = Boolean(attention?.needsInput || attention?.completed);
  const isMacOS = window.desktopEnvironment.platform === "darwin";
  const triggerLeft = isMacOS ? 80 : 20;
  const titleMarginLeft = Math.max(0, triggerLeft + 44 - 16);
  const reserveTitleStart = isMobile || state === "collapsed";

  return (
    <header
      className="
        relative flex h-12 shrink-0 items-center gap-3 border-b
        border-border-subtle bg-background/80 px-4
      "
      data-electron-drag
      data-workspace-mode="chat"
    >
      {running ? (
        <span
          aria-hidden="true"
          className="
            workspace-streaming-line absolute inset-x-0 -bottom-px h-[1.5px]
          "
        />
      ) : null}
      <WorkspaceSidebarControlTarget />
      <h1
        className="
          flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-sm
          font-medium transition-[margin] duration-200 ease-linear
        "
        style={{ marginLeft: reserveTitleStart ? titleMarginLeft : 0 }}
        title={
          is.nonEmptyString(breadcrumbProject)
            ? `${breadcrumbProject} › ${title}`
            : title
        }
      >
        {is.nonEmptyString(breadcrumbProject) ? (
          <>
            <span className="shrink-0 font-normal text-muted-foreground">
              {breadcrumbProject}
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 font-normal text-muted-foreground/60"
            >
              ›
            </span>
          </>
        ) : null}
        <span className="truncate">{title}</span>
      </h1>
      {showAttention ? (
        <span
          aria-label={t("workspace.backgroundChatStatus")}
          className="flex shrink-0 items-center gap-1"
          title={t("workspace.backgroundChatStatus")}
        >
          {attention?.needsInput ? (
            <span
              aria-label={t("workspace.backgroundChatNeedsInput")}
              className="
                size-2 rounded-full bg-status-attention
                shadow-[0_0_0_1px_var(--status-attention-border),0_0_0_4px_var(--status-attention-soft)]
              "
              role="img"
            />
          ) : null}
          {attention?.completed ? (
            <span
              aria-label={t("workspace.backgroundChatCompleted")}
              className="
                size-2 rounded-full bg-status-success
                shadow-[0_0_0_1px_var(--status-success-border)]
              "
              role="img"
            />
          ) : null}
        </span>
      ) : null}
      {!is.falsy(workspaceToolActions) ? (
        <div className="flex shrink-0 items-center gap-1">
          {workspaceToolActions}
        </div>
      ) : null}
      {onToggleRightSidebar ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={rightSidebarToggleLabel}
              className="text-muted-foreground"
              data-electron-no-drag
              onClick={onToggleRightSidebar}
              size="icon-sm"
              title={rightSidebarToggleLabel}
              type="button"
              variant="ghost"
            >
              {rightSidebarOpen ? (
                <SidebarFold className="scale-x-[-1]" />
              ) : (
                <SidebarUnfold className="scale-x-[-1]" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {rightSidebarToggleLabel}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </header>
  );
}
