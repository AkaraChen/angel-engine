import { useTranslation } from "react-i18next";

import type { ChatAttentionState } from "@/features/chat/state/chat-run-store";

type WorkspaceHeaderProps = {
  attention?: ChatAttentionState;
  title: string;
};

export function WorkspaceHeader({ attention, title }: WorkspaceHeaderProps) {
  const { t } = useTranslation();
  const showAttention = Boolean(attention?.needsInput || attention?.completed);

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 bg-background/80 px-4 backdrop-blur-xl dark:border-white/10"
      data-electron-drag
    >
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>
      {showAttention ? (
        <span
          aria-label={t("workspace.backgroundChatStatus")}
          className="flex shrink-0 items-center gap-1"
          title={t("workspace.backgroundChatStatus")}
        >
          {attention?.needsInput ? (
            <span
              aria-label={t("workspace.backgroundChatNeedsInput")}
              className="size-2 rounded-full bg-amber-400 shadow-[0_0_0_1px_rgba(245,158,11,0.42),0_0_0_4px_rgba(245,158,11,0.14)]"
              role="img"
            />
          ) : null}
          {attention?.completed ? (
            <span
              aria-label={t("workspace.backgroundChatCompleted")}
              className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
              role="img"
            />
          ) : null}
        </span>
      ) : null}
    </header>
  );
}
