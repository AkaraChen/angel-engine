import type {
  Chat,
  ChatCreationLocation,
  ChatHistoryMessage,
  ChatRuntimeConfig,
} from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactNode } from "react";
import type { ChatComposerSubmission } from "@/features/chat/components/composer/chat-composer";
import { ArrowUp, StopCircle as CircleStop } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
import { DraftProjectSelect } from "@/app/workspace/draft-project-select";
import {
  isProjectWorkspaceMode,
  useWorkspaceUiStore,
} from "@/app/workspace/workspace-ui-store";
import {
  PromptInputFooter,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/features/chat/components/composer/chat-composer";
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
    overflow-visible rounded-xl border-0 bg-transparent shadow-none
    has-[textarea]:rounded-xl
    has-[>[data-align=block-end]]:rounded-xl
    has-[>[data-align=block-start]]:rounded-xl
    [&_button]:shadow-none
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
  cwd?: string;
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
  cwd,
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
  const isRunning = useChatRunIsRunning(slotKey);
  const cancelRun = useChatRunStore((state) => state.cancelRun);
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  const sendChatMessage = useSendChatMessage(slotKey, {
    chatId: undefined,
    creationLocation,
    cwd,
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
  const { isEmpty } = editor;

  const send = useCallback(
    async ({
      files,
      mentionedFiles,
      selectedSkills,
      text,
    }: ChatComposerSubmission) => {
      await sendChatMessage.sendPromptMessage({
        attachments: files,
        mentionedFiles,
        selectedSkills,
        t,
        text,
      });
    },
    [sendChatMessage, t],
  );

  const handleCancel = useCallback(() => {
    cancelRun(slotKey);
  }, [cancelRun, slotKey]);

  return (
    <div
      className="
        flex h-full animate-in flex-col items-center justify-center
        overflow-y-auto p-4 duration-200 ease-swift fade-in-0
        slide-in-from-bottom-2
        sm:px-7
      "
    >
      <div className="relative w-full max-w-2xl">
        <h2
          className="
            mb-7 text-center font-display text-[1.75rem]/tight font-semibold
            tracking-[-0.015em] text-balance text-foreground
          "
        >
          {is.nonEmptyString(projectName) ? (
            <Trans
              components={{ project: <SketchUnderline /> }}
              i18nKey="thread.empty.titleWithProject"
              values={{ projectName }}
            />
          ) : (
            <Trans
              components={{ brand: <SketchUnderline /> }}
              i18nKey="thread.empty.title"
            />
          )}
        </h2>
        <div
          className="
            relative rounded-xl border border-border-subtle bg-card
            shadow-panel
          "
        >
          <ChatComposer
            blockSubmit={isRunning}
            canCancel={isRunning}
            controller={editor}
            disabled={isRunning}
            headerClassName={newChatHeaderClassName}
            inputGroupClassName={newChatInputGroupClassName}
            onBeforeSubmit={onBeforeSubmit}
            onCancel={handleCancel}
            rows={3}
            send={send}
            textareaClassName="
              max-h-40 min-h-(--workspace-composer-min-height) resize-none
              px-3.5 py-3 [font-size:var(--workspace-composer-text-size)]
              leading-(--workspace-composer-line-height)
              placeholder:text-muted-foreground/55
            "
          >
            <NewChatComposerFooter
              editorIsEmpty={isEmpty}
              isRunning={isRunning}
              onCancel={handleCancel}
            />
          </ChatComposer>

          {isProjectWorkspaceMode(workspaceMode) && (
            <div
              className="
                flex items-center justify-start gap-2 rounded-b-xl border-t
                border-border-subtle bg-surface-1/50 px-3 py-2
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
        <div
          className="
            mt-4 flex animate-in flex-wrap justify-center gap-2 duration-200
            ease-swift fade-in-0 slide-in-from-bottom-1 [animation-delay:120ms]
            [animation-fill-mode:backwards]
          "
        >
          {(
            [
              "thread.empty.suggestionExplore",
              "thread.empty.suggestionFix",
              "thread.empty.suggestionTests",
            ] as const
          ).map((suggestionKey) => (
            <button
              className="
                rounded-lg border border-border-subtle bg-card px-3 py-1.5
                text-xs text-muted-foreground transition-colors
                hover:bg-overlay-hover hover:text-foreground
                active:translate-y-px
              "
              key={suggestionKey}
              onClick={() => {
                editor.editor
                  ?.chain()
                  .focus()
                  .clearContent()
                  .insertContent(t(suggestionKey))
                  .run();
              }}
              type="button"
            >
              {t(suggestionKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewChatComposerFooter({
  editorIsEmpty,
  isRunning,
  onCancel,
}: {
  editorIsEmpty: boolean;
  isRunning: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const chatOptions = useChatOptions();
  const attachments = usePromptInputAttachments();
  const isEmpty = editorIsEmpty && attachments.files.length === 0;

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
            className="h-8 px-3 text-xs"
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
          className="group/send"
          disabled={isRunning || isEmpty}
          size="icon-sm"
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
