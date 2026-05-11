import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ComposerPrimitive,
  useAui,
  useAuiState,
  type CreateAttachment,
} from "@assistant-ui/react";
import {
  ArrowUp,
  Bot,
  Brain,
  Check,
  CircleStop,
  Cpu,
  Hammer,
  ListChecks,
  Loader2,
  Paperclip,
  Quote,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import {
  useChatOptions,
  type ChatOptionsContextValue,
} from "@/features/chat/runtime/chat-options-context";
import {
  findBuildModeOption,
  findPlanModeOption,
} from "@/features/chat/runtime/mode-options";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { iconButtonClass } from "@/features/chat/components/thread-styles";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import { useApi } from "@/platform/use-api";
import { AGENT_OPTIONS, type AgentValueOption } from "@/shared/agents";
import { useToast } from "@/components/ui/toast";
import type {
  ChatAvailableCommand,
  ProjectFileSearchResult,
} from "@/shared/chat";

type ComposerMentionedFile = ProjectFileSearchResult & {
  id: string;
};

type ComposerAssistPanelProps = {
  fileMentionOpen: boolean;
  fileResults: ProjectFileSearchResult[];
  fileSearchLoading: boolean;
  onSelectMentionedFile: (file: ProjectFileSearchResult) => void;
  onSelectSlashCommand: (command: ChatAvailableCommand) => void;
  slashCommandCatalogSize: number;
  slashCommands: ChatAvailableCommand[];
  slashCommandsLoading: boolean;
  slashCommandOpen: boolean;
};

type AssistPanelFrameProps = {
  children: ReactNode;
  title: string;
};

type SlashCommandAssistPanelProps = {
  catalogSize: number;
  commands: ChatAvailableCommand[];
  loading: boolean;
  onSelect: (command: ChatAvailableCommand) => void;
};

type FileMentionAssistPanelProps = {
  files: ProjectFileSearchResult[];
  loading: boolean;
  onSelect: (file: ProjectFileSearchResult) => void;
};

const composerInputGroupClassName =
  "overflow-visible !rounded-[1.35rem] !border !border-foreground/10 !bg-background/85 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.85)_inset] backdrop-blur-xl transition-[border-color,box-shadow,background-color] has-[textarea]:!rounded-[1.35rem] has-[>[data-align=block-end]]:!rounded-[1.35rem] has-[>[data-align=block-start]]:!rounded-[1.35rem] focus-within:!border-foreground/16 focus-within:!bg-background/95 focus-within:shadow-[0_18px_42px_-26px_rgba(0,0,0,0.58),0_0_0_2px_rgba(29,29,31,0.045),0_1px_0_rgba(255,255,255,0.9)_inset] dark:!border-white/10 dark:!bg-card/80 dark:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.08)_inset] dark:focus-within:!border-white/16 dark:focus-within:!bg-card/90 dark:focus-within:shadow-[0_18px_42px_-26px_rgba(0,0,0,0.86),0_0_0_2px_rgba(255,255,255,0.055),0_1px_0_rgba(255,255,255,0.1)_inset]";

export function AssistantComposer() {
  const aui = useAui();
  const api = useApi();
  const environment = useChatEnvironment();
  const canCancel = useAuiState((state) => state.composer.canCancel);
  const isInputDisabled = useAuiState((state) => state.thread.isDisabled);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const toast = useToast();
  const [draftText, setDraftText] = useState("");
  const [mentionedFiles, setMentionedFiles] = useState<ComposerMentionedFile[]>(
    [],
  );
  const [fileResults, setFileResults] = useState<ProjectFileSearchResult[]>([]);
  const [fileSearchLoading, setFileSearchLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectToolsEnabled =
    environment.isProjectChat && environment.projectPath;
  const mentionQuery = projectToolsEnabled
    ? mentionQueryFromDraft(draftText)
    : null;
  const fileMentionOpen = mentionQuery !== null;
  const slashQuery = projectToolsEnabled
    ? slashQueryFromDraft(draftText)
    : null;
  const slashCommands = useMemo(
    () =>
      slashQuery === null
        ? []
        : filterSlashCommands(environment.availableCommands, slashQuery),
    [environment.availableCommands, slashQuery],
  );
  const slashCommandOpen = slashQuery !== null;
  const slashCommandsLoading = environment.availableCommandsLoading;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text;
      const hasMessage =
        text.length > 0 ||
        message.files.length > 0 ||
        mentionedFiles.length > 0;
      if (!hasMessage) {
        return;
      }

      const composer = aui.composer();

      composer.setText(text);

      try {
        await Promise.all([
          ...message.files.map((file) =>
            composer.addAttachment(createAttachmentFromPromptFile(file)),
          ),
          ...mentionedFiles.map((file) =>
            composer.addAttachment(createMentionAttachment(file)),
          ),
        ]);

        await composer.send();
        setDraftText("");
        setMentionedFiles([]);
      } catch (error) {
        await composer.clearAttachments().catch(() => undefined);
        throw error;
      }
    },
    [aui, mentionedFiles],
  );

  useEffect(() => {
    if (
      !projectToolsEnabled ||
      mentionQuery === null ||
      !environment.projectPath
    ) {
      setFileResults([]);
      setFileSearchLoading(false);
      return;
    }

    let cancelled = false;
    setFileSearchLoading(true);
    const timeout = window.setTimeout(() => {
      void api.projects
        .searchFiles({
          limit: 12,
          query: mentionQuery,
          root: environment.projectPath ?? "",
        })
        .then((results) => {
          if (!cancelled) setFileResults(results);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setFileResults([]);
          toast({
            description: getErrorMessage(error),
            title: "Could not search files",
            variant: "destructive",
          });
        })
        .finally(() => {
          if (!cancelled) setFileSearchLoading(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [api, environment.projectPath, mentionQuery, projectToolsEnabled, toast]);

  const handleAttachmentError = useCallback(
    (error: AttachmentInputError) => {
      toast({
        description: error.message,
        title: attachmentErrorTitle(error.code),
        variant: "destructive",
      });
    },
    [toast],
  );

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftText(event.currentTarget.value);
    },
    [],
  );

  const insertSlashCommand = useCallback(
    (command?: ChatAvailableCommand) => {
      if (!command) return;
      const next = draftText.replace(/^\/[^\s]*/, `/${command.name}`);
      setDraftText(`${next.trimEnd()} `);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [draftText],
  );

  const selectMentionedFile = useCallback((file: ProjectFileSearchResult) => {
    setMentionedFiles((current) => {
      if (current.some((item) => item.path === file.path)) return current;
      return [...current, { ...file, id: file.path }];
    });
    setDraftText((current) => replaceMentionQuery(current, file.relativePath));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const removeMentionedFile = useCallback((id: string) => {
    setMentionedFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const handleTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        if (slashCommandOpen || fileMentionOpen) {
          setDraftText((current) =>
            slashCommandOpen ? "" : current.replace(/(?:^|\s)@[^\s@]*$/, ""),
          );
          event.preventDefault();
          return;
        }
        if (!canCancel) return;
        event.preventDefault();
        aui.composer().cancel();
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey &&
        slashCommandOpen &&
        (slashCommandsLoading || slashCommands[0])
      ) {
        event.preventDefault();
        if (slashCommands[0]) {
          insertSlashCommand(slashCommands[0]);
        }
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey &&
        fileMentionOpen &&
        fileResults[0]
      ) {
        event.preventDefault();
        selectMentionedFile(fileResults[0]);
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && isRunning) {
        event.preventDefault();
      }
    },
    [
      aui,
      canCancel,
      fileMentionOpen,
      fileResults,
      insertSlashCommand,
      isRunning,
      selectMentionedFile,
      slashCommandOpen,
      slashCommands,
      slashCommandsLoading,
    ],
  );

  return (
    <PromptInput
      inputGroupClassName={composerInputGroupClassName}
      multiple
      onError={handleAttachmentError}
      onSubmit={handleSubmit}
    >
      <ComposerAssistPanel
        fileMentionOpen={fileMentionOpen}
        fileResults={fileResults}
        fileSearchLoading={fileSearchLoading}
        onSelectMentionedFile={selectMentionedFile}
        onSelectSlashCommand={insertSlashCommand}
        slashCommandCatalogSize={environment.availableCommands.length}
        slashCommandsLoading={slashCommandsLoading}
        slashCommandOpen={slashCommandOpen}
        slashCommands={slashCommands}
      />

      <AssistantComposerHeader
        mentionedFiles={mentionedFiles}
        onRemoveMentionedFile={removeMentionedFile}
      />

      <PromptInputBody>
        <PromptInputTextarea
          className="max-h-40 min-h-[4.75rem] px-4 py-3 text-[15px] leading-6 placeholder:text-muted-foreground/65"
          disabled={isInputDisabled}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          placeholder="Ask Angel Engine to inspect, patch, test, or explain..."
          ref={textareaRef}
          rows={2}
          value={draftText}
        />
      </PromptInputBody>

      <AssistantComposerFooter draftText={draftText} />
    </PromptInput>
  );
}

function AssistantComposerHeader({
  mentionedFiles,
  onRemoveMentionedFile,
}: {
  mentionedFiles: ComposerMentionedFile[];
  onRemoveMentionedFile: (id: string) => void;
}) {
  const attachments = usePromptInputAttachments();
  const hasQuote = useAuiState((state) => Boolean(state.composer.quote));

  if (
    !hasQuote &&
    attachments.files.length === 0 &&
    mentionedFiles.length === 0
  ) {
    return null;
  }

  return (
    <PromptInputHeader className="flex-col items-stretch gap-2 !px-3 !pb-2 !pt-3">
      {hasQuote ? (
        <ComposerPrimitive.Quote className="flex items-start gap-2 rounded-xl border border-foreground/10 bg-muted/35 p-2 text-sm">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 text-muted-foreground" />
          <ComposerPrimitive.QuoteDismiss className={iconButtonClass}>
            <X className="size-3.5" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>
      ) : null}

      {mentionedFiles.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {mentionedFiles.map((file) => (
            <ChatAttachmentTile
              className="max-w-64"
              contentType={file.relativePath}
              key={file.id}
              name={file.name}
              onRemove={() => onRemoveMentionedFile(file.id)}
              removeLabel={`Remove ${file.name}`}
              typeLabel="Mention"
            />
          ))}
        </div>
      ) : null}

      {attachments.files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.files.map((file) => {
            const mediaType = file.mediaType ?? "application/octet-stream";
            const isImage = mediaType.startsWith("image/");
            const name = file.filename ?? "Attachment";

            return (
              <ChatAttachmentTile
                className="max-w-64"
                contentType={mediaType}
                key={file.id}
                name={name}
                onRemove={() => attachments.remove(file.id)}
                previewUrl={isImage ? file.url : undefined}
                removeLabel={`Remove ${name}`}
                typeLabel={isImage ? "Image" : "File"}
              />
            );
          })}
        </div>
      ) : null}
    </PromptInputHeader>
  );
}

function ComposerAssistPanel({
  fileMentionOpen,
  fileResults,
  fileSearchLoading,
  onSelectMentionedFile,
  onSelectSlashCommand,
  slashCommandCatalogSize,
  slashCommandsLoading,
  slashCommandOpen,
  slashCommands,
}: ComposerAssistPanelProps) {
  if (slashCommandOpen) {
    return (
      <SlashCommandAssistPanel
        catalogSize={slashCommandCatalogSize}
        commands={slashCommands}
        loading={slashCommandsLoading}
        onSelect={onSelectSlashCommand}
      />
    );
  }

  if (fileMentionOpen) {
    return (
      <FileMentionAssistPanel
        files={fileResults}
        loading={fileSearchLoading}
        onSelect={onSelectMentionedFile}
      />
    );
  }

  return null;
}

function AssistPanelFrame({ children, title }: AssistPanelFrameProps) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-foreground/10 bg-popover/95 p-1 text-popover-foreground shadow-[0_18px_48px_-24px_rgba(0,0,0,0.65)] backdrop-blur-xl dark:border-white/10">
      <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
        {title}
      </div>
      <div className="max-h-48 overflow-y-auto">{children}</div>
    </div>
  );
}

function SlashCommandAssistPanel({
  catalogSize,
  commands,
  loading,
  onSelect,
}: SlashCommandAssistPanelProps) {
  if (loading) {
    return (
      <AssistPanelFrame title="Commands">
        <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Loading commands</span>
        </div>
      </AssistPanelFrame>
    );
  }

  if (commands.length === 0) {
    const emptyMessage =
      catalogSize === 0 ? "No commands advertised" : "No matching commands";

    return (
      <AssistPanelFrame title="Commands">
        <div className="px-2 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </AssistPanelFrame>
    );
  }

  return (
    <AssistPanelFrame title="Commands">
      {commands.map((command) => (
        <button
          className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          key={command.name}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(command)}
          type="button"
        >
          <span className="shrink-0 font-mono text-xs text-primary">
            /{command.name}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {command.description}
          </span>
          {command.inputHint ? (
            <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">
              {command.inputHint}
            </span>
          ) : null}
        </button>
      ))}
    </AssistPanelFrame>
  );
}

function FileMentionAssistPanel({
  files,
  loading,
  onSelect,
}: FileMentionAssistPanelProps) {
  if (loading) {
    return (
      <AssistPanelFrame title="Files">
        <div className="px-2 py-2 text-sm text-muted-foreground">
          Searching...
        </div>
      </AssistPanelFrame>
    );
  }

  if (files.length === 0) {
    return (
      <AssistPanelFrame title="Files">
        <div className="px-2 py-2 text-sm text-muted-foreground">
          No files found
        </div>
      </AssistPanelFrame>
    );
  }

  return (
    <AssistPanelFrame title="Files">
      {files.map((file) => (
        <button
          className="flex w-full min-w-0 flex-col rounded-sm px-2 py-1.5 text-left hover:bg-muted"
          key={file.path}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(file)}
          type="button"
        >
          <span className="truncate text-sm">{file.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {file.relativePath}
          </span>
        </button>
      ))}
    </AssistPanelFrame>
  );
}

function AssistantComposerFooter({ draftText }: { draftText: string }) {
  const aui = useAui();
  const attachments = usePromptInputAttachments();
  const chatOptions = useChatOptions();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isEmpty = draftText.length === 0 && attachments.files.length === 0;

  const stopRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  return (
    <PromptInputFooter className="flex-wrap border-t border-foreground/8 !px-3 !py-2.5 dark:border-white/10">
      <PromptInputTools className="flex-wrap">
        <PromptAttachmentButton />
        <ComposerModelMenu disabled={isRunning} options={chatOptions} />
      </PromptInputTools>
      <div className="flex min-w-0 items-center gap-2">
        <PlanModeToggleButton disabled={isRunning} options={chatOptions} />
        <ComposerOptionSelect
          className="hidden max-w-28"
          disabled={
            isRunning ||
            !chatOptions.canSetMode ||
            chatOptions.modeOptions.length < 2
          }
          icon={<SlidersHorizontal />}
          label="Mode"
          onValueChange={chatOptions.setMode}
          options={chatOptions.modeOptions}
          value={chatOptions.mode}
        />
        {isRunning ? (
          <Button
            className="h-8 rounded-full border-foreground/10 bg-background/65 px-3 text-xs dark:bg-card/65"
            onClick={stopRun}
            size="sm"
            type="button"
            variant="outline"
          >
            <CircleStop />
            Cancel
          </Button>
        ) : null}
        <Button
          aria-label="Send"
          className="size-8 rounded-full p-0 shadow-sm active:translate-y-px"
          disabled={isRunning || isEmpty}
          size="sm"
          type="submit"
        >
          <ArrowUp />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </PromptInputFooter>
  );
}

function PlanModeToggleButton({
  disabled,
  options,
}: {
  disabled?: boolean;
  options: ChatOptionsContextValue;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const planMode = findPlanModeOption(options.modeOptions);
  const buildMode = findBuildModeOption(options.modeOptions);
  const isPlanMode = Boolean(planMode && options.mode === planMode.value);
  const targetMode = isPlanMode ? buildMode : planMode;
  const unavailable =
    disabled ||
    pending ||
    options.configLoading ||
    !options.canSetMode ||
    !planMode ||
    !buildMode ||
    !targetMode;
  const label = isPlanMode ? "Plan" : "Build";
  const title = isPlanMode ? "Switch to build mode" : "Switch to plan mode";
  const Icon = isPlanMode ? ListChecks : Hammer;

  return (
    <Button
      aria-pressed={isPlanMode}
      className="h-8 gap-1.5 rounded-full px-2 text-xs"
      disabled={unavailable}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!targetMode) return;
        setPending(true);
        void Promise.resolve(options.setMode(targetMode.value))
          .catch((error: unknown) => {
            toast({
              description: getErrorMessage(error),
              title: "Could not change mode",
              variant: "destructive",
            });
          })
          .finally(() => setPending(false));
      }}
      title={title}
      type="button"
      variant="ghost"
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </Button>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function ComposerOptionSelect({
  className,
  disabled,
  icon,
  label,
  onValueChange,
  options,
  title,
  value,
}: {
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  options: AgentValueOption[];
  title?: string;
  value: string;
}) {
  return (
    <PromptInputSelect
      disabled={disabled}
      onValueChange={onValueChange}
      value={value}
    >
      <PromptInputSelectTrigger
        aria-label={label}
        className={[
          "h-8 max-w-36 rounded-full border border-foreground/10 bg-background/65 px-2 text-xs dark:bg-card/65",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        size="sm"
        title={title ?? label}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
            {icon}
          </span>
          <PromptInputSelectValue />
        </span>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent className="rounded-md">
        {options.map((option) => (
          <PromptInputSelectItem
            className="rounded-sm"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}

function PromptAttachmentButton() {
  const attachments = usePromptInputAttachments();

  return (
    <Button
      onClick={attachments.openFileDialog}
      size="icon-sm"
      title="Attach files"
      type="button"
      variant="ghost"
    >
      <Paperclip />
      <span className="sr-only">Attach files</span>
    </Button>
  );
}

function ComposerModelMenu({
  disabled,
  options,
}: {
  disabled?: boolean;
  options: ChatOptionsContextValue;
}) {
  const providerOptions = AGENT_OPTIONS.map((agent) => ({
    label: agent.label,
    value: agent.id,
  }));
  const providerLabel =
    AGENT_OPTIONS.find((agent) => agent.id === options.runtime)?.label ??
    options.runtime;
  const modelLabel = optionLabel(options.modelOptions, options.model);
  const effortLabel = optionLabel(
    options.reasoningEffortOptions,
    options.reasoningEffort,
  );
  const modelDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetModel ||
    options.modelOptions.length < 2;
  const effortDisabled =
    disabled ||
    !options.canSetReasoningEffort ||
    options.reasoningEffortOptions.length < 2;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 max-w-[22rem] gap-1.5 rounded-full border border-foreground/10 bg-background/65 px-2 text-xs shadow-none dark:bg-card/65"
          disabled={disabled}
          size="sm"
          title="Provider, model, and reasoning effort"
          type="button"
          variant="outline"
        >
          <Bot className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{providerLabel}</span>
          <span className="text-muted-foreground">/</span>
          <span className="min-w-0 truncate">{modelLabel}</span>
          <span className="text-muted-foreground">/</span>
          <span className="min-w-0 truncate">
            {shortEffortLabel(effortLabel)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 rounded-md" align="start">
        <DropdownMenuLabel>Agent settings</DropdownMenuLabel>
        <ComposerModelMenuSub
          disabled={options.runtimeLocked || disabled}
          icon={<Bot />}
          label="Provider"
          value={providerLabel}
        >
          {providerOptions.map((provider) => (
            <ComposerModelMenuItem
              key={provider.value}
              label={provider.label}
              onSelect={() => options.setRuntime(provider.value)}
              selected={provider.value === options.runtime}
            />
          ))}
        </ComposerModelMenuSub>
        <ComposerModelMenuSub
          disabled={modelDisabled}
          icon={<Cpu />}
          label="Model"
          value={options.configLoading ? "Loading..." : modelLabel}
        >
          {options.modelOptions.map((model) => (
            <ComposerModelMenuItem
              key={model.value}
              label={model.label}
              onSelect={() => options.setModel(model.value)}
              selected={model.value === options.model}
            />
          ))}
        </ComposerModelMenuSub>
        <ComposerModelMenuSub
          disabled={effortDisabled}
          icon={<Brain />}
          label="Effort"
          value={effortLabel}
        >
          {options.reasoningEffortOptions.map((effort) => (
            <ComposerModelMenuItem
              key={effort.value}
              label={effort.label}
              onSelect={() => options.setReasoningEffort(effort.value)}
              selected={effort.value === options.reasoningEffort}
            />
          ))}
        </ComposerModelMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComposerModelMenuSub({
  children,
  disabled,
  icon,
  label,
  value,
}: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className="rounded-sm"
        disabled={disabled}
        title={label}
      >
        <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate">{value}</span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 w-64 rounded-md overflow-y-auto">
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ComposerModelMenuItem({
  label,
  onSelect,
  selected,
}: {
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <DropdownMenuItem
      className="rounded-sm"
      onSelect={(event) => {
        event.preventDefault();
        if (!selected) onSelect();
      }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenuItem>
  );
}

function optionLabel(options: AgentValueOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function shortEffortLabel(label: string) {
  return label.toLowerCase() === "use default" ? "Default" : label;
}

function createAttachmentFromPromptFile(
  file: PromptInputMessage["files"][number],
): CreateAttachment {
  const filename = file.filename ?? "Attachment";
  const mediaType = file.mediaType ?? "application/octet-stream";
  const url = file.url ?? "";
  const path = promptFilePath(file);
  const isImage = mediaType.startsWith("image/");

  if (!url || url.startsWith("blob:")) {
    throw new Error(`Could not read ${filename}. Try attaching it again.`);
  }

  const content = isImage
    ? {
        ...(path ? { path } : {}),
        filename,
        image: url,
        type: "image" as const,
      }
    : {
        ...(path ? { path } : {}),
        data: url,
        filename,
        mimeType: mediaType,
        type: "file" as const,
      };

  return {
    content: [content] as CreateAttachment["content"],
    contentType: mediaType,
    name: filename,
    type: isImage ? "image" : "file",
  };
}

function createMentionAttachment(
  file: ComposerMentionedFile,
): CreateAttachment {
  return {
    content: [
      {
        data: file.path,
        filename: file.name,
        mention: true,
        mimeType: "application/octet-stream",
        path: file.path,
        type: "file",
      },
    ] as unknown as CreateAttachment["content"],
    contentType: "application/octet-stream",
    name: file.name,
    type: "file",
  };
}

function promptFilePath(file: PromptInputMessage["files"][number]) {
  const path = file.path;
  return typeof path === "string" && path ? path : undefined;
}

function slashQueryFromDraft(text: string) {
  const match = /^\/([^\s/]*)$/.exec(text);
  return match ? match[1].toLowerCase() : null;
}

function filterSlashCommands(commands: ChatAvailableCommand[], query: string) {
  const normalized = query.toLowerCase();
  return commands
    .filter((command) => {
      const name = command.name.toLowerCase();
      return !normalized || name.includes(normalized);
    })
    .slice(0, 8);
}

function mentionQueryFromDraft(text: string) {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(text);
  return match ? match[1] : null;
}

function replaceMentionQuery(text: string, relativePath: string) {
  const replacement = `@${relativePath} `;
  if (/(?:^|\s)@[^\s@]*$/.test(text)) {
    return text.replace(
      /(^|\s)@[^\s@]*$/,
      (_match, prefix: string) => `${prefix}${replacement}`,
    );
  }
  const separator = text && !/\s$/.test(text) ? " " : "";
  return `${text}${separator}${replacement}`;
}

type AttachmentInputError = {
  code: "max_files" | "max_file_size" | "accept" | "file_read" | "submit";
  message: string;
};

function attachmentErrorTitle(code: AttachmentInputError["code"]) {
  switch (code) {
    case "accept":
      return "File type blocked";
    case "max_file_size":
      return "File is too large";
    case "max_files":
      return "Too many files";
    case "file_read":
      return "Could not read file";
    case "submit":
      return "Could not send attachment";
  }
}
