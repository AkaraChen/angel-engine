import type {
  Chat,
  ChatCreationLocation,
  ChatHistoryMessage,
  ChatRuntimeConfig,
} from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { DragEvent, ReactNode } from "react";
import type {
  ChatComposerBeforeSubmitResult,
  ChatComposerSubmission,
} from "@/features/chat/components/composer/chat-composer";
import { ArrowUp, StopCircle as CircleStop } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useCallback, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { DraftProjectSelect } from "@/app/workspace/draft-project-select";
import { NewChatRecentSection } from "@/app/workspace/new-chat-recent";
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
import { PromptSourceControlAttachButton } from "@/features/chat/components/composer/source-control-attach-button";
import { useComposerEditor } from "@/features/chat/components/composer/use-composer-editor";
import { useTerminalSelectionInsert } from "@/features/chat/components/composer/use-terminal-selection-insert";
import { SketchUnderline } from "@/features/chat/components/sketch-underline";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";
import { useSendChatMessage } from "@/features/chat/runtime/use-send-chat-message";
import {
  useChatRunIsRunning,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";
import { cn } from "@/platform/utils";

/**
 * The card *is* the input group here, so the focus ring the primitive already
 * owns lands on the whole composer instead of an invisible inner box.
 */
const newChatInputGroupClassName = cn(
  `
    overflow-visible rounded-2xl border-(--workspace-composer-border) bg-card
    shadow-panel
    transition-[border-color,box-shadow,background-color] duration-150
    ease-standard
    has-[textarea]:rounded-2xl
    has-[>[data-align=block-end]]:rounded-2xl
    has-[>[data-align=block-start]]:rounded-2xl
    focus-within:ring-primary/20
    motion-reduce:transition-none
    [&_button]:shadow-none
  `,
);

/**
 * Files dropped anywhere on the card are attached by the prompt-input form
 * listener; this only says so. A dashed primary edge reads as "drop target"
 * without an overlay covering the text you were mid-way through writing.
 */
const newChatDropTargetClassName = cn(
  "border-dashed border-primary bg-primary-soft/45",
);

const newChatHeaderClassName = cn(
  "flex-col items-stretch gap-2 px-3.5! pt-3.5! pb-2!",
);

/**
 * Every control in the toolbar is a chip: `rounded-full`, hairline border, mono
 * label. Scoped to this footer rather than pushed into the shared composer
 * primitives, which stay rectangular in the chat surface. Matched on
 * `data-variant` rather than `data-slot=button` because a Radix trigger rendered
 * `asChild` replaces the slot but keeps the variant. Heights are left alone so
 * the compact workspace modes keep their own (still >= 28px) hit targets.
 */
const newChatFooterClassName = cn(
  `
    flex-wrap gap-1.5 border-t-0 px-3! py-2.5! shadow-none
    [&_button[data-variant]]:rounded-full [&_button[data-variant]]:font-mono
    [&_button[data-variant]]:text-xs
    [&_button[data-variant=ghost]]:border-border-subtle
  `,
);
const chatSuggestionKeys = [
  "thread.empty.suggestionClarify",
  "thread.empty.suggestionSummarize",
  "thread.empty.suggestionWrite",
] as const;
const projectSuggestionKeys = [
  "thread.empty.suggestionExplore",
  "thread.empty.suggestionFix",
  "thread.empty.suggestionTests",
] as const;

interface NewChatComposerProps {
  chats: Chat[];
  creationLocation?: ChatCreationLocation;
  creationLocationAccessory?: ReactNode;
  cwd?: string;
  initialMarkdown?: string;
  model?: string;
  mode?: string;
  notice?: ReactNode;
  onBeforeSubmit?: () =>
    | ChatComposerBeforeSubmitResult
    | Promise<ChatComposerBeforeSubmitResult>;
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
  onOpenChat: (chat: Chat) => void;
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
  chats,
  creationLocation,
  creationLocationAccessory,
  cwd,
  initialMarkdown,
  model,
  mode,
  notice,
  onBeforeSubmit,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  onCreateProject,
  onOpenChat,
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
  const suggestionKeys = isProjectWorkspaceMode(workspaceMode)
    ? projectSuggestionKeys
    : chatSuggestionKeys;

  const editor = useComposerEditor({ initialMarkdown });
  useTerminalSelectionInsert(editor);
  const sourceAttachment = editor.sourceControlAttachments[0];
  const isChangeRequest = sourceAttachment?.kind === "changeRequest";
  const sendChatMessage = useSendChatMessage(slotKey, {
    chatId: undefined,
    creationLocation: isChangeRequest ? "worktree" : creationLocation,
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
    sourceLink:
      sourceAttachment === undefined
        ? undefined
        : {
            kind: sourceAttachment.kind,
            provider: sourceAttachment.providerId,
            url: sourceAttachment.url,
          },
    worktreeRef:
      isChangeRequest && is.nonEmptyString(sourceAttachment.sourceBranch)
        ? {
            remoteRef: `heads/${sourceAttachment.sourceBranch}`,
            type: "existingBranch",
            value: sourceAttachment.sourceBranch,
          }
        : undefined,
  });
  const { isEmpty } = editor;

  const send = useCallback(
    async ({
      files,
      mentionedFiles,
      selectedSkills,
      text,
      worktreeSetupApproval,
    }: ChatComposerSubmission) => {
      await sendChatMessage.sendPromptMessage({
        attachments: files,
        mentionedFiles,
        selectedSkills,
        t,
        text,
        worktreeSetupApproval,
      });
    },
    [sendChatMessage, t],
  );

  const handleCancel = useCallback(() => {
    cancelRun(slotKey);
  }, [cancelRun, slotKey]);

  const [isDropTarget, setIsDropTarget] = useState(false);
  // dragenter/dragleave fire for every nested element the pointer crosses, so
  // the depth counter is what keeps the edge from flickering mid-card.
  const dragDepth = useRef(0);
  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setIsDropTarget(true);
  }, []);
  const handleDragLeave = useCallback(() => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDropTarget(false);
  }, []);
  const handleDragEnd = useCallback(() => {
    dragDepth.current = 0;
    setIsDropTarget(false);
  }, []);

  return (
    <div className="relative h-full min-h-0">
      {/* The one surface in the app that gets the paper texture. It sits under
          the scroll area rather than inside it so the dots read as the surface
          the draft rests on, not as content that scrolls away. */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0 dot-grid opacity-35
          dark:opacity-45
        "
      />
      <div className="relative h-full overflow-y-auto p-4 sm:px-7">
        <div
          className="
            mx-auto flex w-full max-w-(--workspace-content-max-width) flex-col
            pt-[max(2rem,11vh)] pb-12
          "
        >
          <h2
            className="
            animate-in text-center font-display font-light
            [font-size:var(--workspace-new-chat-title-size)] leading-tight
            tracking-[-0.025em] text-balance text-foreground duration-300
            ease-standard fade-in-0 slide-in-from-bottom-[6px]
            [animation-fill-mode:backwards]
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
          <p
            className="
            mt-3 animate-in text-center
            [font-size:var(--workspace-new-chat-description-size)]
            text-balance text-muted-foreground duration-300 ease-standard
            fade-in-0 slide-in-from-bottom-[6px] [animation-delay:60ms]
            [animation-fill-mode:backwards]
          "
          >
            {t("thread.empty.description")}
          </p>

          <div
            className="
            relative mt-8 animate-in duration-300 ease-standard fade-in-0
            slide-in-from-bottom-[6px] [animation-delay:120ms]
            [animation-fill-mode:backwards]
          "
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragEnd}
            onDrop={handleDragEnd}
          >
            {notice}
            <ChatComposer
              blockSubmit={isRunning}
              canCancel={isRunning}
              controller={editor}
              disabled={isRunning}
              headerClassName={newChatHeaderClassName}
              inputGroupClassName={cn(
                newChatInputGroupClassName,
                isDropTarget && newChatDropTargetClassName,
              )}
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
                editor={editor}
                editorIsEmpty={isEmpty}
                isRunning={isRunning}
                onCancel={handleCancel}
                projectSelect={
                  isProjectWorkspaceMode(workspaceMode) ? (
                    <>
                      <DraftProjectSelect
                        onCreateProject={onCreateProject}
                        onProjectChange={onProjectChange}
                        projects={projects}
                        selectedProjectId={projectId}
                        variant="chip"
                      />
                      {creationLocationAccessory}
                    </>
                  ) : null
                }
              />
            </ChatComposer>
          </div>

          <div
            className="
            mt-4 flex animate-in flex-wrap justify-center gap-2 duration-300
            ease-standard fade-in-0 slide-in-from-bottom-[6px]
            [animation-delay:180ms] [animation-fill-mode:backwards]
          "
          >
            {suggestionKeys.map((suggestionKey) => (
              <button
                className="
                rounded-full border border-border-subtle bg-card px-3 py-1
                text-xs text-muted-foreground transition-colors duration-120
                ease-standard
                hover:bg-overlay-hover hover:text-foreground
                focus-visible:ring-2 focus-visible:ring-ring
                focus-visible:ring-offset-2 focus-visible:ring-offset-background
                focus-visible:outline-none
                active:scale-[0.98]
                motion-reduce:transition-none
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

          <div
            className="
            animate-in duration-300 ease-standard fade-in-0
            slide-in-from-bottom-[6px] [animation-delay:240ms]
            [animation-fill-mode:backwards]
          "
          >
            <NewChatRecentSection
              chats={chats}
              isProjectMode={isProjectWorkspaceMode(workspaceMode)}
              onCreateProject={() => void onCreateProject()}
              onOpenChat={onOpenChat}
              projects={projects}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function NewChatComposerFooter({
  editor,
  editorIsEmpty,
  isRunning,
  onCancel,
  projectSelect,
}: {
  editor: ReturnType<typeof useComposerEditor>;
  editorIsEmpty: boolean;
  isRunning: boolean;
  projectSelect: ReactNode;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const chatOptions = useChatOptions();
  const attachments = usePromptInputAttachments();
  const isEmpty =
    editorIsEmpty &&
    attachments.files.length === 0 &&
    editor.sourceControlAttachments.length === 0;

  return (
    <PromptInputFooter className={newChatFooterClassName}>
      <PromptInputTools className="flex-wrap gap-1.5">
        {projectSelect}
        <PromptAttachmentButton />
        <PromptSourceControlAttachButton
          disabled={isRunning}
          onAttached={editor.addSourceControlAttachment}
        />
        <ComposerModelMenu disabled={isRunning} options={chatOptions} />
      </PromptInputTools>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {isRunning ? (
          <Button
            className="px-3"
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            <CircleStop />
            {t("common.cancel")}
          </Button>
        ) : null}
        {/* The one primary CTA on this screen, so it keeps the DNA capsule and
            the hover lift that the rest of the app's buttons give up. */}
        <Button
          aria-label={t("common.send")}
          className="
            group/send
            hover:-translate-y-0.5 hover:shadow-panel
            disabled:bg-surface-2 disabled:text-muted-foreground
            disabled:opacity-100
            motion-reduce:hover:translate-y-0
          "
          disabled={isRunning || isEmpty}
          size="icon-sm"
          type="submit"
        >
          <ArrowUp weight="regular" />
          <span className="sr-only">{t("common.send")}</span>
        </Button>
      </div>
    </PromptInputFooter>
  );
}
