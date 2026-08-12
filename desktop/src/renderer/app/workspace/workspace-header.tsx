import type { PathLauncherActionId } from "@shared/path-launcher";
import type { ReactElement } from "react";
import type { ChatAttentionState } from "@/features/chat/state/chat-run-store";

import {
  SidebarSimple as SidebarFold,
  SidebarSimple as SidebarUnfold,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import { WorkspaceSidebarControlTarget } from "@/app/workspace/workspace-sidebar-control";
import { WorkspaceToolHeaderButton } from "@/app/workspace/workspace-tool-surface-header";
import { useSidebar } from "@/components/ui/sidebar";
import { UsageChip } from "@/features/usage/usage-chip";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { PathLauncherContextMenu } from "@/features/path-launcher/components/path-launcher-context-menu";

interface WorkspaceHeaderProps {
  attention?: ChatAttentionState;
  breadcrumbProject?: string;
  includeAngelTerminal?: boolean;
  onPathLauncherAction?: (action: PathLauncherActionId) => void;
  onToggleRightSidebar?: () => void;
  rightSidebarOpen?: boolean;
  rightSidebarToggleLabel?: string;
  running?: boolean;
  title: string;
}

export function WorkspaceHeader({
  attention,
  breadcrumbProject,
  includeAngelTerminal,
  onPathLauncherAction,
  onToggleRightSidebar,
  rightSidebarOpen = false,
  rightSidebarToggleLabel,
  running = false,
  title,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation();
  const resolvedRightSidebarToggleLabel =
    rightSidebarToggleLabel ?? t("workspace.rightSidebar.toggle");
  const { isMobile, state } = useSidebar();
  const showAttention = Boolean(attention?.needsInput || attention?.completed);
  const isMacOS = window.desktopEnvironment.platform === "darwin";
  const triggerLeft = isMacOS ? 80 : 20;
  const titleMarginLeft = Math.max(0, triggerLeft + 44 - 16);
  const reserveTitleStart = isMobile || state === "collapsed";
  const titleElement: ReactElement = (
    <h1
      className="
        flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-sm font-medium
        transition-[margin] duration-200 ease-linear
      "
      data-electron-no-drag={onPathLauncherAction ? true : undefined}
      style={{ marginLeft: reserveTitleStart ? titleMarginLeft : 0 }}
      title={
        is.nonEmptyString(breadcrumbProject)
          ? `${breadcrumbProject} › ${title}`
          : title
      }
    >
      {is.nonEmptyString(breadcrumbProject) ? (
        <>
          <span className="shrink-0 font-semibold text-primary">
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
  );

  return (
    <header
      className="
        relative flex h-12 shrink-0 items-center gap-3 bg-background px-4
      "
      data-electron-drag
      data-workspace-mode="chat"
    >
      {running ? (
        <span
          aria-hidden="true"
          className="
            workspace-streaming-line absolute inset-x-0 -bottom-px h-[2px]
          "
        />
      ) : null}
      <WorkspaceSidebarControlTarget />
      {onPathLauncherAction === undefined ? (
        titleElement
      ) : (
        <PathLauncherContextMenu
          includeAngelTerminal={includeAngelTerminal}
          onSelect={onPathLauncherAction}
        >
          {titleElement}
        </PathLauncherContextMenu>
      )}
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
      <UsageChip />
      <NotificationCenter />
      {onToggleRightSidebar ? (
        <WorkspaceToolHeaderButton
          icon={
            rightSidebarOpen ? (
              <SidebarFold className="scale-x-[-1]" weight="duotone" />
            ) : (
              <SidebarUnfold className="scale-x-[-1]" weight="duotone" />
            )
          }
          label={resolvedRightSidebarToggleLabel}
          onClick={onToggleRightSidebar}
        />
      ) : null}
    </header>
  );
}
