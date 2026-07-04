import type { MouseEventHandler, ReactElement } from "react";
import { Archive, Robot as Bot } from "@phosphor-icons/react";

import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import {
  WorkspaceSidebarMenuAction,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
import { useChatAttention } from "@/features/chat/state/chat-run-store";
import { cn } from "@/platform/utils";

import { ChatRunningPulse } from "./chat-running-pulse";

interface ChatSidebarItemProps {
  chatId: string;
  title: string;
  tooltip: string;
  isActive: boolean;
  nested?: boolean;
  onArchiveChat?: () => Promise<void> | void;
  onOpenChat: () => void;
  onShowContextMenu?: () => Promise<void> | void;
  runtime?: string | null;
}

export function ChatSidebarItem({
  chatId,
  title,
  tooltip,
  isActive,
  nested,
  onArchiveChat,
  onOpenChat,
  onShowContextMenu,
  runtime,
}: ChatSidebarItemProps): ReactElement {
  const { t } = useTranslation();
  const runtimeIconSvg = agentRuntimeIconSvg(runtime);
  const runtimeLabel = agentRuntimeLabel(runtime);
  const handleContextMenu: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    if (onShowContextMenu) {
      void onShowContextMenu();
    }
  };

  return (
    <div className="group/chat-sidebar-item relative">
      <WorkspaceSidebarMenuButton
        className={cn("gap-1.5 pr-8!", nested && "pl-6")}
        isActive={isActive}
        onClick={onOpenChat}
        onContextMenu={onShowContextMenu ? handleContextMenu : undefined}
        title={tooltip}
      >
        <span
          className="flex size-4 shrink-0 items-center justify-center"
          title={runtimeLabel}
        >
          {is.nonEmptyString(runtimeIconSvg) ? (
            <span
              aria-hidden="true"
              className="
                flex size-2.5 items-center justify-center
                text-sidebar-foreground/55
                [&_svg]:block [&_svg]:size-2.5 [&_svg]:shrink-0
              "
              // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
              // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
              dangerouslySetInnerHTML={{ __html: runtimeIconSvg }}
            />
          ) : (
            <Bot className="size-2.5 text-sidebar-foreground/55" />
          )}
        </span>
        <span
          className="
            block min-w-0 flex-1 truncate overflow-hidden text-left
            whitespace-nowrap
          "
          title={title}
        >
          {title}
        </span>
      </WorkspaceSidebarMenuButton>
      <ChatSidebarTrailingSlot
        archiveLabel={t("sidebar.archiveChat")}
        chatId={chatId}
        onArchiveChat={onArchiveChat}
      />
    </div>
  );
}

function ChatSidebarTrailingSlot({
  archiveLabel,
  chatId,
  onArchiveChat,
}: {
  archiveLabel: string;
  chatId: string;
  onArchiveChat?: () => Promise<void> | void;
}): ReactElement {
  return (
    <>
      <span
        className="
          absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center
          justify-center
          group-data-[collapsible=icon]:hidden
        "
      >
        <span
          className={cn(
            `
              pointer-events-none absolute inset-0 flex items-center
              justify-center gap-1 transition-opacity
            `,
            onArchiveChat &&
              `
                group-focus-within/chat-sidebar-item:opacity-0
                group-hover/chat-sidebar-item:opacity-0
              `,
          )}
        >
          <ChatAttentionIndicators chatId={chatId} />
          <ChatRunningPulse chatId={chatId} />
        </span>
        {onArchiveChat ? (
          <WorkspaceSidebarMenuAction
            aria-label={archiveLabel}
            className="
              pointer-events-none inset-0! flex size-5! items-center
              justify-center opacity-0
              group-focus-within/chat-sidebar-item:pointer-events-auto
              group-focus-within/chat-sidebar-item:opacity-100
              group-hover/chat-sidebar-item:pointer-events-auto
              group-hover/chat-sidebar-item:opacity-100
              peer-data-active/menu-button:text-sidebar-foreground/78
              aria-expanded:opacity-100
              [&_svg]:size-4
            "
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onArchiveChat();
            }}
            title={archiveLabel}
            type="button"
          >
            <Archive />
          </WorkspaceSidebarMenuAction>
        ) : null}
      </span>
    </>
  );
}

function ChatAttentionIndicators({
  chatId,
}: {
  chatId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const attention = useChatAttention(chatId);
  if (!attention.needsInput && !attention.completed) return null;

  return (
    <span
      aria-label={t("sidebar.chatAttention")}
      className="flex shrink-0 items-center gap-1"
      title={t("sidebar.chatAttention")}
    >
      {attention.needsInput ? (
        <span
          aria-label={t("sidebar.needsInput")}
          className="
            size-1.5 rounded-full bg-amber-400
            shadow-[0_0_0_1px_rgba(245,158,11,0.34)]
          "
          role="img"
        />
      ) : null}
      {attention.completed ? (
        <span
          aria-label={t("sidebar.completed")}
          className="
            size-1.5 rounded-full bg-emerald-500
            shadow-[0_0_0_1px_rgba(16,185,129,0.28)]
          "
          role="img"
        />
      ) : null}
    </span>
  );
}
