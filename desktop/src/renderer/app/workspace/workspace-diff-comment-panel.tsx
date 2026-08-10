import type { DiffComment } from "@/app/workspace/workspace-diff-comments";
import type { FormEvent } from "react";

import is from "@sindresorhus/is";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import {
  chatIdFromWorkspaceToolContextKey,
  formatDiffCommentsForAgent,
  isSendableDiffComment,
  projectIdFromWorkspaceToolContextKey,
} from "@/app/workspace/workspace-diff-comments";
import {
  selectDiffCommentsForRoot,
  selectSendableDiffCommentIds,
  useWorkspaceDiffCommentStore,
} from "@/app/workspace/workspace-diff-comment-store";
import { chatRoutePath } from "@/app/workspace/workspace-route-paths";
import {
  isProjectWorkspaceMode,
  useWorkspaceUiStore,
} from "@/app/workspace/workspace-ui-store";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";
import { cn } from "@/platform/utils";
import { queryKeys } from "@/platform/query-keys";
import { useQueryClient } from "@tanstack/react-query";

export function WorkspaceDiffCommentPanel({ root }: { root: string }) {
  const { t } = useTranslation();
  const comments = useWorkspaceDiffCommentStore((state) => state.comments);
  const setBody = useWorkspaceDiffCommentStore((state) => state.setBody);
  const setSelected = useWorkspaceDiffCommentStore(
    (state) => state.setSelected,
  );
  const setStatus = useWorkspaceDiffCommentStore((state) => state.setStatus);
  const deleteComment = useWorkspaceDiffCommentStore(
    (state) => state.deleteComment,
  );
  const markSendablePending = useWorkspaceDiffCommentStore(
    (state) => state.markSendablePending,
  );
  const startRun = useChatRunStore((state) => state.startRun);
  const activeChatId = useChatRunStore((state) => state.activeChatId);
  const { contextKey } = useWorkspaceToolSurface();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const rootComments = useMemo(
    () => selectDiffCommentsForRoot(comments, root),
    [comments, root],
  );
  const sendableIds = useMemo(
    () => selectSendableDiffCommentIds(rootComments),
    [rootComments],
  );

  const handleSend = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (sendableIds.length === 0 || sending) {
        return;
      }

      const prompt = formatDiffCommentsForAgent(rootComments);
      if (!is.nonEmptyString(prompt)) {
        return;
      }

      setSending(true);
      setErrorMessage(undefined);
      try {
        const contextChatId = chatIdFromWorkspaceToolContextKey(contextKey);
        const chatId = activeChatId ?? contextChatId;
        const projectId = projectIdFromWorkspaceToolContextKey(contextKey);

        await startRun({
          callbacks: {
            onChatCreated: (chat) => {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.chats.list(),
              });
              navigate(
                chatRoutePath(chat, {
                  includeProject: isProjectWorkspaceMode(workspaceMode),
                }),
              );
            },
          },
          input: {
            chatId,
            cwd: root,
            projectId,
          },
          message: {
            attachments: [],
            content: [{ text: prompt, type: "text" }],
            createdAt: new Date(),
            metadata: { custom: {} },
            parentId: null,
            role: "user",
            runConfig: undefined,
            sourceId: null,
          },
          slotKey: chatId ?? `diff-comments:${root}:${Date.now()}`,
        });
        markSendablePending(sendableIds);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : t("common.error"),
        );
      } finally {
        setSending(false);
      }
    },
    [
      activeChatId,
      contextKey,
      markSendablePending,
      navigate,
      queryClient,
      root,
      rootComments,
      sendableIds,
      sending,
      startRun,
      t,
      workspaceMode,
    ],
  );

  if (rootComments.length === 0) {
    return null;
  }

  return (
    <form
      className="flex shrink-0 flex-col border-t border-border-subtle bg-card"
      onSubmit={(event) => {
        void handleSend(event);
      }}
    >
      <div
        className="
          flex h-8 items-center gap-2 border-b border-border-subtle px-3 text-xs
        "
      >
        <span className="min-w-0 flex-1 font-medium text-foreground">
          {t("workspace.tools.comments.title", {
            count: rootComments.length,
          })}
        </span>
        <Button
          disabled={sendableIds.length === 0 || sending}
          size="sm"
          type="submit"
          variant="default"
        >
          {sending
            ? t("workspace.tools.comments.sending")
            : t("workspace.tools.comments.sendToAgent", {
                count: sendableIds.length,
              })}
        </Button>
      </div>
      <div className="max-h-48 overflow-auto">
        <ul className="divide-y divide-border-subtle">
          {rootComments.map((comment) => (
            <DiffCommentListItem
              comment={comment}
              key={comment.id}
              onBodyChange={(body) => setBody(comment.id, body)}
              onDelete={() => deleteComment(comment.id)}
              onResolve={() => setStatus(comment.id, "resolved")}
              onSelectedChange={(selected) => setSelected(comment.id, selected)}
              onUnresolve={() => setStatus(comment.id, "open")}
            />
          ))}
        </ul>
      </div>
      {is.nonEmptyString(errorMessage) ? (
        <div className="border-t border-border-subtle px-3 py-1.5 text-xs text-status-danger">
          {errorMessage}
        </div>
      ) : null}
    </form>
  );
}

function DiffCommentListItem({
  comment,
  onBodyChange,
  onDelete,
  onResolve,
  onSelectedChange,
  onUnresolve,
}: {
  comment: DiffComment;
  onBodyChange: (body: string) => void;
  onDelete: () => void;
  onResolve: () => void;
  onSelectedChange: (selected: boolean) => void;
  onUnresolve: () => void;
}) {
  const { t } = useTranslation();
  const sideLabel =
    comment.side === "additions"
      ? t("workspace.tools.comments.sideNew")
      : t("workspace.tools.comments.sideOld");
  const statusLabel = t(`workspace.tools.comments.status.${comment.status}`);
  const canSend = isSendableDiffComment(comment);

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <Checkbox
          aria-label={t("workspace.tools.comments.select")}
          checked={comment.selected && comment.status !== "resolved"}
          className="mt-0.5"
          disabled={comment.status === "resolved" || comment.body.trim() === ""}
          onCheckedChange={(value) => onSelectedChange(value === true)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-mono font-medium text-foreground">
              {comment.path}
            </span>
            <span className="tabular-nums text-muted-foreground">
              L{comment.lineNumber} · {sideLabel}
            </span>
            <span
              className={cn(
                "rounded-sm px-1 py-px text-[10px] font-medium uppercase",
                comment.status === "resolved" &&
                  "bg-status-success-soft text-status-success",
                comment.status === "pending" &&
                  "bg-status-attention-soft text-status-attention",
                comment.status === "open" && "bg-muted text-muted-foreground",
              )}
            >
              {statusLabel}
            </span>
          </div>
          {is.nonEmptyString(comment.snippet) ? (
            <div className="mt-0.5 truncate font-mono text-muted-foreground">
              {comment.snippet}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {comment.status === "resolved" ? (
            <Button
              onClick={onUnresolve}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("workspace.tools.comments.reopen")}
            </Button>
          ) : (
            <Button onClick={onResolve} size="sm" type="button" variant="ghost">
              {t("workspace.tools.comments.resolve")}
            </Button>
          )}
          <Button onClick={onDelete} size="sm" type="button" variant="ghost">
            {t("workspace.tools.comments.delete")}
          </Button>
        </div>
      </div>
      <Textarea
        aria-label={t("workspace.tools.comments.placeholder")}
        className="min-h-12 p-2 text-xs"
        disabled={comment.status === "resolved"}
        placeholder={t("workspace.tools.comments.placeholder")}
        value={comment.body}
        onChange={(event) => onBodyChange(event.target.value)}
      />
      {!canSend &&
      comment.selected &&
      comment.status !== "resolved" &&
      comment.body.trim() === "" ? (
        <div className="text-[11px] text-muted-foreground">
          {t("workspace.tools.comments.needsBody")}
        </div>
      ) : null}
    </li>
  );
}
