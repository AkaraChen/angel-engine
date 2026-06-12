import type { ChatAttentionState } from "@/features/chat/state/chat-run-store";
import type { ReactNode } from "react";

import {
  RiSidebarFoldLine as SidebarFold,
  RiSidebarUnfoldLine as SidebarUnfold,
} from "@remixicon/react";
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
  onToggleRightSidebar?: () => void;
  rightSidebarOpen?: boolean;
  rightSidebarToggleLabel?: string;
  title: string;
  workspaceToolActions?: ReactNode;
}

export function WorkspaceHeader({
  attention,
  onToggleRightSidebar,
  rightSidebarOpen = false,
  rightSidebarToggleLabel = "Toggle workspace tools",
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
        flex h-12 shrink-0 items-center gap-3 border-b border-foreground/10
        bg-background/80 px-4
        dark:border-white/10
      "
      data-electron-drag
      data-workspace-mode="chat"
    >
      <WorkspaceSidebarControlTarget />
      <h1
        className="
          min-w-0 flex-1 truncate text-sm font-medium transition-[margin]
          duration-200 ease-linear
        "
        style={{ marginLeft: reserveTitleStart ? titleMarginLeft : 0 }}
        title={title}
      >
        {title}
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
                size-2 rounded-full bg-amber-400
                shadow-[0_0_0_1px_rgba(245,158,11,0.42),0_0_0_4px_rgba(245,158,11,0.14)]
              "
              role="img"
            />
          ) : null}
          {attention?.completed ? (
            <span
              aria-label={t("workspace.backgroundChatCompleted")}
              className="
                size-2 rounded-full bg-emerald-500
                shadow-[0_0_0_1px_rgba(16,185,129,0.35)]
              "
              role="img"
            />
          ) : null}
        </span>
      ) : null}
      {workspaceToolActions ? (
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
