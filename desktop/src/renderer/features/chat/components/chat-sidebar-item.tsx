import type { MouseEventHandler, ReactElement } from "react";
import { Archive, Robot as Bot, PushPin } from "@phosphor-icons/react";

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
  pinned?: boolean;
  runtime?: string | null;
  /** Branch or working-directory name, rendered mono on the metadata line. */
  subtitle?: string;
  /** Pre-formatted relative time for the metadata line. */
  timestamp?: string;
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
  pinned,
  runtime,
  subtitle,
  timestamp,
}: ChatSidebarItemProps): ReactElement {
  const { t } = useTranslation();
  const runtimeIconSvg = agentRuntimeIconSvg(runtime);
  const runtimeLabel = agentRuntimeLabel(runtime);
  const hasMetaLine =
    is.nonEmptyString(subtitle) || is.nonEmptyString(timestamp);
  const handleContextMenu: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    if (onShowContextMenu) {
      void onShowContextMenu();
    }
  };

  return (
    <div className="group/chat-sidebar-item relative">
      <WorkspaceSidebarMenuButton
        className={cn(
          "gap-1.5 pr-8!",
          nested && "pl-6",
          // The two-line variant grows past the fixed menu-button height.
          hasMetaLine && "h-auto! items-start py-1.5",
        )}
        isActive={isActive}
        onClick={onOpenChat}
        onContextMenu={onShowContextMenu ? handleContextMenu : undefined}
        title={tooltip}
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center",
            hasMetaLine && "mt-0.5",
          )}
          title={pinned ? t("sidebar.dateGroups.pinned") : runtimeLabel}
        >
          {pinned ? (
            <PushPin
              className="size-2.5 text-sidebar-foreground/55"
              weight="fill"
            />
          ) : is.nonEmptyString(runtimeIconSvg) ? (
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
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
          <span
            className="
              block min-w-0 truncate overflow-hidden text-left font-medium
              whitespace-nowrap
            "
            title={title}
          >
            {title}
          </span>
          {hasMetaLine ? (
            <span
              className="
                flex min-w-0 items-baseline gap-1.5 font-mono text-[0.625rem]
                leading-4 text-muted-foreground
              "
            >
              {is.nonEmptyString(subtitle) ? (
                <span className="min-w-0 truncate" title={subtitle}>
                  {subtitle}
                </span>
              ) : null}
              {is.nonEmptyString(timestamp) ? (
                <span className="ml-auto shrink-0 tabular-nums">
                  {timestamp}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </WorkspaceSidebarMenuButton>
      {isActive ? (
        <span
          aria-hidden="true"
          className="
            pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full
            bg-primary
          "
        />
      ) : null}
      <ChatSidebarTrailingSlot
        archiveLabel={t("sidebar.archiveChat")}
        chatId={chatId}
        onArchiveChat={onArchiveChat}
        pinToTop={hasMetaLine}
      />
    </div>
  );
}

function ChatSidebarTrailingSlot({
  archiveLabel,
  chatId,
  onArchiveChat,
  pinToTop,
}: {
  archiveLabel: string;
  chatId: string;
  onArchiveChat?: () => Promise<void> | void;
  pinToTop: boolean;
}): ReactElement {
  return (
    <span
      className={cn(
        `
          absolute right-2 flex size-5 items-center justify-center
          group-data-[collapsible=icon]:hidden
        `,
        pinToTop ? "top-2" : "top-1/2 -translate-y-1/2",
      )}
    >
      <span
        className={cn(
          `
            pointer-events-none absolute inset-0 flex items-center justify-center
            gap-1 transition-opacity
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
            pointer-events-none inset-0! flex size-5! items-center justify-center
            rounded-sm opacity-0
            group-focus-within/chat-sidebar-item:pointer-events-auto
            group-focus-within/chat-sidebar-item:opacity-100
            group-hover/chat-sidebar-item:pointer-events-auto
            group-hover/chat-sidebar-item:opacity-100
            peer-data-active/menu-button:text-primary-soft-foreground
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
      {/* Status dots carry no glow ring — the hue alone is the signal. */}
      {attention.needsInput ? (
        <span
          aria-label={t("sidebar.needsInput")}
          className="size-1.5 rounded-full bg-status-attention"
          role="img"
        />
      ) : null}
      {attention.completed ? (
        <span
          aria-label={t("sidebar.completed")}
          className="size-1.5 rounded-full bg-status-success"
          role="img"
        />
      ) : null}
    </span>
  );
}
