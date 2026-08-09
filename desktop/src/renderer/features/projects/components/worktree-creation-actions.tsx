import type { Chat } from "@angel-engine/daemon-api/chat";
import { ArrowClockwise, ArrowSquareOut, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

type MaybeAsync = void | Promise<void>;

export function WorktreeCreationActions({
  chat,
  onCancel,
  onOpenChat,
  onRetry,
  projectChats,
}: {
  chat: Chat;
  onCancel: (chat: Chat) => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onRetry: (chat: Chat) => MaybeAsync;
  projectChats: Chat[];
}) {
  const { t } = useTranslation();
  const creation = chat.worktreeCreation;
  if (creation === undefined) return null;

  const branchOwner =
    creation.errorCode === "worktree-branch-in-use" &&
    creation.relatedChatId !== undefined
      ? projectChats.find(
          (candidate) => candidate.id === creation.relatedChatId,
        )
      : undefined;
  const failed = creation.status === "failed";

  return (
    <>
      {failed && branchOwner !== undefined ? (
        <button
          aria-label={t("sidebar.openBranchChat")}
          className="rounded p-1 hover:bg-sidebar-accent"
          onClick={() => void onOpenChat(branchOwner)}
          title={t("sidebar.openBranchChat")}
          type="button"
        >
          <ArrowSquareOut className="size-3" />
        </button>
      ) : failed ? (
        <button
          aria-label={t("sidebar.retryWorktreeCreation")}
          className="rounded p-1 hover:bg-sidebar-accent"
          onClick={() => void onRetry(chat)}
          title={t("sidebar.retryWorktreeCreation")}
          type="button"
        >
          <ArrowClockwise className="size-3" />
        </button>
      ) : null}
      <button
        aria-label={t("common.cancel")}
        className="rounded p-1 hover:bg-sidebar-accent"
        onClick={() => void onCancel(chat)}
        title={t("common.cancel")}
        type="button"
      >
        <X className="size-3" />
      </button>
    </>
  );
}
