import type {
  Chat,
  ChatCreationLocation,
  ChatHistoryMessage,
  ChatRuntimeConfig,
} from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ReactNode } from "react";
import type {
  PromptInputFile,
  PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import type { AttachmentInputError } from "@/features/chat/components/composer/composer-helpers";
import { ArrowUp, StopCircle as CircleStop } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
import { DraftProjectSelect } from "@/app/workspace/draft-project-select";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ComposerEditor } from "@/features/chat/components/composer/composer-editor";
import {
  attachmentErrorMessage,
  attachmentErrorTitle,
} from "@/features/chat/components/composer/composer-helpers";
import {
  ComposerModelMenu,
  PromptAttachmentButton,
} from "@/features/chat/components/composer/composer-menus";
import { PlanModeToggleButton } from "@/features/chat/components/composer/composer-plan-mode";
import { useComposerEditor } from "@/features/chat/components/composer/use-composer-editor";
import { SketchUnderline } from "@/features/chat/components/sketch-underline";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";
import { useSendChatMessage } from "@/features/chat/runtime/use-send-chat-message";
import {
  useChatRunIsRunning,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";
import { cn } from "@/platform/utils";

const newChatInputGroupClassName = cn(
  `
    overflow-visible rounded-2xl border-0 bg-transparent shadow-none
    backdrop-blur-xl
    has-[textarea]:rounded-2xl
    has-[>[data-align=block-end]]:rounded-2xl
    has-[>[data-align=block-start]]:rounded-2xl
    [&_button]:shadow-none
    [&_button:focus-visible]:border-transparent!
    [&_button:focus-visible]:ring-0!
  `,
);

const newChatHeaderClassName = cn(
  "flex-col items-stretch gap-2 px-3.5! pt-3.5! pb-2!",
);
const newChatFooterClassName = cn(
  "flex-wrap gap-2 border-t-0 px-3.5! py-2.5! shadow-none",
);

interface NewChatComposerProps {
  creationLocation?: ChatCreationLocation;
  creationLocationAccessory?: ReactNode;
  model?: string;
  mode?: string;
  onBeforeSubmit?: () => boolean | Promise<boolean>;
  onChatCreated?: (chat: Chat) => void;
  onChatMessagesUpdated?: (
    chatId: string,
    messages: ChatHistoryMessage[],
    config?: ChatRuntimeConfig,
  ) => void;
  onChatUpdated?: (
    chat: Chat,
    messages?: ChatHistoryMessage[],
    config?: ChatRuntimeConfig,
  ) => void;
  onCreateProject: () => Project | undefined | Promise<Project | undefined>;
  onProjectChange: (projectId: string | null) => void;
  permissionMode?: string;
  prewarmId?: string;
  projectId?: string;
  projectName?: string;
  projects: Project[];
  reasoningEffort?: string;
  runtime: string;
  slotKey: string;
}

export function NewChatComposer({
  creationLocation,
  creationLocationAccessory,
  model,
  mode,
  onBeforeSubmit,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  onCreateProject,
  onProjectChange,
  permissionMode,
  prewarmId,
  projectId,
  projectName,
  projects,
  reasoningEffort,
  runtime,
  slotKey,
}: NewChatComposerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isRunning = useChatRunIsRunning(slotKey);
  const cancelRun = useChatRunStore((state) => state.cancelRun);
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  const sendChatMessage = useSendChatMessage(slotKey, {
    chatId: undefined,
    creationLocation,
    model,
    mode,
    onChatCreated,
    onChatMessagesUpdated,
    onChatUpdated,
    permissionMode,
    prewarmId,
    projectId: projectId ?? null,
    reasoningEffort,
    runtime,
  });

  const editor = useComposerEditor();
  const { draftText, mentionedFiles, reset, selectedSkills } = editor;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text;
      const hasMessage =
        text.length > 0 ||
        message.files.length > 0 ||
        mentionedFiles.length > 0 ||
        selectedSkills.length > 0;
      if (!hasMessage) {
        return;
      }
      if (onBeforeSubmit && !(await onBeforeSubmit())) {
        return;
      }

      await sendChatMessage.sendPromptMessage({
        attachments: message.files as PromptInputFile[],
        mentionedFiles,
        selectedSkills,
        t,
        text,
      });

      reset();
    },
    [mentionedFiles, onBeforeSubmit, reset, selectedSkills, sendChatMessage, t],
  );

  const handleAttachmentError = useCallback(
    (error: { code: AttachmentInputError["code"]; message: string }) => {
      toast({
        description: attachmentErrorMessage(error.code, t),
        title: attachmentErrorTitle(error.code, t),
        variant: "destructive",
      });
    },
    [t, toast],
  );

  const handleCancel = useCallback(() => {
    cancelRun(slotKey);
  }, [cancelRun, slotKey]);

  return (
    <div
      className="
        flex h-full animate-in flex-col items-center justify-center
        overflow-y-auto p-4 duration-300 fade-in-0 slide-in-from-bottom-2
        sm:px-7
      "
    >
      <div className="relative w-full max-w-3xl">
        <div
          aria-hidden="true"
          className="
            pointer-events-none absolute -inset-x-24 -inset-y-16
            bg-[radial-gradient(ellipse_50%_60%_at_50%_45%,--theme(--color-primary/4%),transparent_65%)]
            dark:bg-[radial-gradient(ellipse_50%_60%_at_50%_45%,--theme(--color-primary/7%),transparent_65%)]
          "
        />
        <div className="relative mb-12 text-center">
          <h2
            className="
              font-display text-(length:--workspace-new-chat-title-size)/tight
              font-semibold tracking-[-0.015em] text-pretty text-foreground
            "
          >
            {is.nonEmptyString(projectName) ? (
              <Trans
                components={{ project: <SketchUnderline /> }}
                i18nKey="thread.empty.titleWithProject"
                values={{ projectName }}
              />
            ) : (
              t("thread.empty.title")
            )}
          </h2>
          <p
            className="
              mx-auto mt-2 max-w-120
              text-(length:--workspace-new-chat-description-size)/6
              text-muted-foreground
            "
          >
            {t("thread.empty.description")}
          </p>
        </div>

        <div
          className="
            relative rounded-2xl border border-border-subtle bg-background/86
            shadow-panel
            dark:bg-card/82
          "
        >
          <PromptInput
            inputGroupClassName={newChatInputGroupClassName}
            multiple
            onError={handleAttachmentError}
            onSubmit={handleSubmit}
          >
            <ComposerEditor
              blockSubmit={isRunning}
              canCancel={isRunning}
              controller={editor}
              disabled={isRunning}
              headerClassName={newChatHeaderClassName}
              onCancel={handleCancel}
              rows={3}
              textareaClassName="
                max-h-40 min-h-(--workspace-composer-min-height) resize-none
                px-3.5 py-3 [font-size:var(--workspace-composer-text-size)]
                leading-(--workspace-composer-line-height)
                placeholder:text-muted-foreground/55
              "
            />

            <NewChatComposerFooter
              draftText={draftText}
              isRunning={isRunning}
              onCancel={handleCancel}
            />
          </PromptInput>

          {workspaceMode === "work" && (
            <div
              className="
                flex items-center justify-start gap-2 rounded-b-2xl border-t
                border-border-subtle bg-surface-1/60 px-3 py-2
              "
            >
              <DraftProjectSelect
                onCreateProject={onCreateProject}
                onProjectChange={onProjectChange}
                projects={projects}
                selectedProjectId={projectId}
                variant="ghost"
              />
              {creationLocationAccessory}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewChatComposerFooter({
  draftText,
  isRunning,
  onCancel,
}: {
  draftText: string;
  isRunning: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const chatOptions = useChatOptions();
  const attachments = usePromptInputAttachments();
  const isEmpty = draftText.length === 0 && attachments.files.length === 0;

  return (
    <PromptInputFooter className={newChatFooterClassName}>
      <PromptInputTools className="flex-wrap">
        <PromptAttachmentButton />
        <ComposerModelMenu disabled={isRunning} options={chatOptions} />
      </PromptInputTools>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <PlanModeToggleButton disabled={isRunning} options={chatOptions} />
        {isRunning ? (
          <Button
            className="
              h-8 rounded-md border-border-subtle bg-background/55 px-3 text-xs
              focus-visible:ring-0!
              dark:bg-card/60
            "
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            <CircleStop />
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button
          aria-label={t("common.send")}
          className="
            group/send size-8 rounded-full p-0 shadow-none
            focus-visible:ring-0!
            active:scale-95
          "
          disabled={isRunning || isEmpty}
          size="sm"
          type="submit"
        >
          <ArrowUp
            className="
              transition-transform duration-150 ease-swift
              group-hover/send:-translate-y-px
            "
          />
          <span className="sr-only">{t("common.send")}</span>
        </Button>
      </div>
    </PromptInputFooter>
  );
}
