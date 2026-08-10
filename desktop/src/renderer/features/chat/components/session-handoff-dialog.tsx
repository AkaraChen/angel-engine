import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ProjectGitStatusResult } from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";

import is from "@sindresorhus/is";
import { Warning as WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
import {
  buildSessionHandoffContextPack,
  type SessionHandoffDirtyStatus,
} from "@/features/chat/runtime/session-handoff-context";
import { useSessionHandoff } from "@/features/chat/runtime/use-session-handoff";
import type { ApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

interface RuntimeOption {
  description?: string;
  label: string;
  value: AgentRuntime;
}

interface SessionHandoffDialogProps {
  api: ApiClient;
  chat: Chat | null;
  onClose: () => void;
  runtimeOptions: RuntimeOption[];
}

export function SessionHandoffDialog({
  api,
  chat,
  onClose,
  runtimeOptions,
}: SessionHandoffDialogProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Dialog open={Boolean(chat)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(90vh,720px)] gap-4 overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.sessionHandoff.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.sessionHandoff.description")}
          </DialogDescription>
        </DialogHeader>
        {chat ? (
          <SessionHandoffForm
            api={api}
            chat={chat}
            key={chat.id}
            onClose={onClose}
            runtimeOptions={runtimeOptions}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SessionHandoffForm({
  api,
  chat,
  onClose,
  runtimeOptions,
}: {
  api: ApiClient;
  chat: Chat;
  onClose: () => void;
  runtimeOptions: RuntimeOption[];
}) {
  const { t } = useTranslation();
  const handoff = useSessionHandoff();
  const [notes, setNotes] = useState("");
  const [submittingRuntime, setSubmittingRuntime] =
    useState<AgentRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sameAgentRuntime = useMemo((): AgentRuntime | null => {
    const match = runtimeOptions.find(
      (option) => option.value === chat.runtime,
    );
    return match?.value ?? null;
  }, [chat.runtime, runtimeOptions]);

  const otherAgents = useMemo(
    () => runtimeOptions.filter((option) => option.value !== chat.runtime),
    [chat.runtime, runtimeOptions],
  );

  const messagesQuery = useQuery({
    queryFn: async () => api.chats.load(chat.id),
    queryKey: queryKeys.chats.detail(chat.id),
    staleTime: 30_000,
  });

  const dirtyQuery = useQuery({
    enabled: is.nonEmptyString(chat.projectId),
    queryFn: async (): Promise<ProjectGitStatusResult> =>
      api.projects.gitStatus({ projectId: chat.projectId as string }),
    queryKey: queryKeys.projects.gitStatus(chat.projectId ?? null),
    staleTime: 15_000,
  });

  // Derive from query `data` (reference-stable when unchanged). Do not build a
  // fresh object each render — that fails react-hooks/exhaustive-deps on pack.
  const dirtyStatus = useMemo((): SessionHandoffDirtyStatus | null => {
    const status = dirtyQuery.data;
    if (!status) return null;
    return {
      branch: status.branch,
      isDirty: status.isDirty,
    };
  }, [dirtyQuery.data]);

  const historyMessages = messagesQuery.data?.messages;
  const pack = useMemo(() => {
    if (!historyMessages) return null;
    return buildSessionHandoffContextPack({
      dirtyStatus,
      messages: historyMessages,
      notes,
      sourceChat: chat,
      targetRuntime: sameAgentRuntime ?? chat.runtime,
    });
  }, [chat, dirtyStatus, historyMessages, notes, sameAgentRuntime]);

  // Recompute pack preview for a chosen target without mutating shared state.
  const previewFor = (targetRuntime: string) => {
    if (!historyMessages) return null;
    return buildSessionHandoffContextPack({
      dirtyStatus,
      messages: historyMessages,
      notes,
      sourceChat: chat,
      targetRuntime,
    });
  };

  useEffect(() => {
    setError(null);
  }, [notes]);

  const isBusy = submittingRuntime !== null || messagesQuery.isPending;

  const submit = async (targetRuntime: AgentRuntime) => {
    if (isBusy) return;
    const nextPack = previewFor(targetRuntime);
    if (!nextPack) {
      setError(t("dialog.sessionHandoff.loadFailed"));
      return;
    }
    setSubmittingRuntime(targetRuntime);
    setError(null);
    try {
      const title = is.nonEmptyString(chat.title)
        ? t("dialog.sessionHandoff.titleFrom", { title: chat.title })
        : t("dialog.sessionHandoff.titleUntitled");
      await handoff({
        prompt: nextPack.prompt,
        sourceChat: chat,
        targetRuntime,
        title,
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("dialog.sessionHandoff.submitFailed"),
      );
      setSubmittingRuntime(null);
    }
  };

  return (
    <div className="grid gap-4">
      {dirtyStatus?.isDirty ? (
        <div
          className="
            flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10
            px-3 py-2 text-sm text-amber-950
            dark:text-amber-100
          "
          role="status"
        >
          <WarningIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">
              {t("dialog.sessionHandoff.dirtyTitle")}
            </p>
            <p className="text-muted-foreground dark:text-amber-100/80">
              {t("dialog.sessionHandoff.dirtyDescription", {
                branch: is.nonEmptyString(dirtyStatus.branch)
                  ? ` (${dirtyStatus.branch})`
                  : "",
              })}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="session-handoff-notes">
          {t("dialog.sessionHandoff.notesLabel")}
        </label>
        <Textarea
          id="session-handoff-notes"
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t("dialog.sessionHandoff.notesPlaceholder")}
          rows={3}
          value={notes}
        />
      </div>

      <div className="grid gap-1.5">
        <p className="text-sm font-medium">
          {t("dialog.sessionHandoff.contextPackLabel")}
        </p>
        <pre
          className="
            max-h-40 overflow-auto rounded-xl border border-border-subtle
            bg-surface-1 p-3 text-xs leading-relaxed whitespace-pre-wrap
            text-muted-foreground
          "
        >
          {messagesQuery.isPending
            ? t("dialog.sessionHandoff.loadingContext")
            : (pack?.prompt ?? t("dialog.sessionHandoff.loadFailed"))}
        </pre>
        {pack && pack.keyFiles.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("dialog.sessionHandoff.keyFilesCount", {
              count: pack.keyFiles.length,
            })}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">
          {t("dialog.sessionHandoff.sameAgentSection")}
        </p>
        {sameAgentRuntime ? (
          <HandoffRuntimeButton
            disabled={isBusy || !messagesQuery.data}
            isCurrent
            label={agentRuntimeLabel(sameAgentRuntime)}
            onSelect={() => void submit(sameAgentRuntime)}
            pending={submittingRuntime === sameAgentRuntime}
            runtime={sameAgentRuntime}
            subtitle={t("dialog.sessionHandoff.sameAgentHint")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("dialog.sessionHandoff.sameAgentUnavailable")}
          </p>
        )}
      </div>

      {otherAgents.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            {t("dialog.sessionHandoff.otherAgentsSection")}
          </p>
          <div className="grid gap-1.5">
            {otherAgents.map((agent) => (
              <HandoffRuntimeButton
                disabled={isBusy || !messagesQuery.data}
                key={agent.value}
                label={agent.label}
                onSelect={() => void submit(agent.value)}
                pending={submittingRuntime === agent.value}
                runtime={agent.value}
                subtitle={agent.description}
              />
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          disabled={isBusy}
          onClick={onClose}
          type="button"
          variant="outline"
        >
          {t("common.cancel")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function HandoffRuntimeButton({
  disabled,
  isCurrent,
  label,
  onSelect,
  pending,
  runtime,
  subtitle,
}: {
  disabled?: boolean;
  isCurrent?: boolean;
  label: string;
  onSelect: () => void;
  pending?: boolean;
  runtime: AgentRuntime;
  subtitle?: string;
}) {
  const iconSvg = agentRuntimeIconSvg(runtime);

  return (
    <button
      className={cn(
        `
          flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5
          text-left transition-colors
          hover:bg-overlay-hover
          active:bg-overlay-active
          disabled:pointer-events-none disabled:opacity-50
        `,
        isCurrent
          ? "border-primary/40 bg-primary/5"
          : "border-border-subtle bg-card",
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {is.nonEmptyString(iconSvg) ? (
        <span
          aria-hidden="true"
          className="
            flex size-5 shrink-0 items-center justify-center text-muted-foreground
            [&_svg]:size-4 [&_svg]:shrink-0
          "
          // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          dangerouslySetInnerHTML={{ __html: iconSvg }}
        />
      ) : (
        <span className="size-5 shrink-0 rounded-md bg-muted" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {pending ? `${label}…` : label}
        </span>
        {is.nonEmptyString(subtitle) ? (
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}
