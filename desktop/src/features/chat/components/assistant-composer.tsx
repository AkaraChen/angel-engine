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
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  Bot,
  Brain,
  Check,
  ChevronDown,
  CircleStop,
  Cpu,
  Hammer,
  ListChecks,
  Loader2,
  Paperclip,
  Quote,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import {
  useChatOptions,
  type ChatOptionsContextValue,
} from "@/features/chat/runtime/chat-options-context";
import { findPlanModeToggleTarget } from "@/features/chat/runtime/mode-options";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  "overflow-visible !rounded-lg !border !border-foreground/[0.08] !bg-background/82 shadow-[0_8px_22px_-20px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-[border-color,background-color] has-[textarea]:!rounded-lg has-[>[data-align=block-end]]:!rounded-lg has-[>[data-align=block-start]]:!rounded-lg has-[[data-slot=input-group-control]:focus-visible]:!border-foreground/12 has-[[data-slot=input-group-control]:focus-visible]:!ring-0 focus-within:!border-foreground/12 focus-within:!bg-background/90 focus-within:!shadow-[0_8px_22px_-20px_rgba(0,0,0,0.42)] dark:!border-white/[0.09] dark:!bg-card/78 dark:shadow-[0_10px_24px_-22px_rgba(0,0,0,0.68)] dark:focus-within:!border-white/13 dark:focus-within:!bg-card/86 dark:focus-within:!shadow-[0_10px_24px_-22px_rgba(0,0,0,0.68)] [&_button:focus-visible]:!border-transparent [&_button:focus-visible]:!ring-0 [&_button]:shadow-none";
const composerModelMenuTriggerClassName =
  "h-8 min-w-0 gap-1.5 rounded-md px-2 text-xs font-medium text-foreground focus-visible:!border-transparent focus-visible:!ring-0 aria-expanded:bg-foreground/[0.055] dark:aria-expanded:bg-white/[0.07]";
const composerModelMenuValueClassName =
  "min-w-0 max-w-28 truncate text-muted-foreground";
const composerNativeMenuClassName =
  "p-1 data-open:zoom-in-100 data-closed:zoom-out-100 data-[side=bottom]:slide-in-from-top-0 data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0 data-[side=top]:slide-in-from-bottom-0";
const composerNativeMenuLabelClassName =
  "px-2 pb-1 pt-1 text-[11px] font-medium leading-4 text-muted-foreground/80";

export function AssistantComposer({
  floatingAccessory,
}: {
  floatingAccessory?: ReactNode;
}) {
  const { t } = useTranslation();
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
            composer.addAttachment(createAttachmentFromPromptFile(file, t)),
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
    [aui, mentionedFiles, t],
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
            title: t("composer.toasts.couldNotSearchFiles"),
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
  }, [
    api,
    environment.projectPath,
    mentionQuery,
    projectToolsEnabled,
    t,
    toast,
  ]);

  const handleAttachmentError = useCallback(
    (error: AttachmentInputError) => {
      toast({
        description: attachmentErrorMessage(error.code, t),
        title: attachmentErrorTitle(error.code, t),
        variant: "destructive",
      });
    },
    [t, toast],
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
      {floatingAccessory ? (
        <div className="absolute top-0 left-4 z-30 -translate-y-1/2">
          {floatingAccessory}
        </div>
      ) : null}
      {floatingAccessory ? (
        <div aria-hidden="true" className="order-first h-4 w-full shrink-0" />
      ) : null}

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
          className="max-h-40 min-h-[4.25rem] px-4 py-3 text-[15px] leading-6 placeholder:text-muted-foreground/65"
          disabled={isInputDisabled}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          placeholder={t("composer.placeholder")}
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
  const { t } = useTranslation();
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
              removeLabel={t("composer.removeAttachment", {
                name: file.name,
              })}
              typeLabel={t("common.mention")}
            />
          ))}
        </div>
      ) : null}

      {attachments.files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.files.map((file) => {
            const mediaType = file.mediaType ?? "application/octet-stream";
            const isImage = mediaType.startsWith("image/");
            const name = file.filename ?? t("common.attachment");

            return (
              <ChatAttachmentTile
                className="max-w-64"
                contentType={mediaType}
                key={file.id}
                name={name}
                onRemove={() => attachments.remove(file.id)}
                previewUrl={isImage ? file.url : undefined}
                removeLabel={t("composer.removeAttachment", { name })}
                typeLabel={isImage ? t("common.image") : t("common.file")}
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
    <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-lg border border-foreground/[0.08] bg-popover/95 p-1 text-popover-foreground shadow-[0_12px_30px_-24px_rgba(0,0,0,0.62)] backdrop-blur-xl dark:border-white/[0.1]">
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
  const { t } = useTranslation();

  if (loading) {
    return (
      <AssistPanelFrame title={t("composer.commands")}>
        <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{t("composer.loadingCommands")}</span>
        </div>
      </AssistPanelFrame>
    );
  }

  if (commands.length === 0) {
    const emptyMessage =
      catalogSize === 0
        ? t("composer.noCommandsAdvertised")
        : t("composer.noMatchingCommands");

    return (
      <AssistPanelFrame title={t("composer.commands")}>
        <div className="px-2 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </AssistPanelFrame>
    );
  }

  return (
    <AssistPanelFrame title={t("composer.commands")}>
      {commands.map((command) => (
        <button
          className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
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
  const { t } = useTranslation();

  if (loading) {
    return (
      <AssistPanelFrame title={t("composer.files")}>
        <div className="px-2 py-2 text-sm text-muted-foreground">
          {t("common.searching")}
        </div>
      </AssistPanelFrame>
    );
  }

  if (files.length === 0) {
    return (
      <AssistPanelFrame title={t("composer.files")}>
        <div className="px-2 py-2 text-sm text-muted-foreground">
          {t("composer.noFilesFound")}
        </div>
      </AssistPanelFrame>
    );
  }

  return (
    <AssistPanelFrame title={t("composer.files")}>
      {files.map((file) => (
        <button
          className="flex w-full min-w-0 flex-col rounded-lg px-2 py-1.5 text-left hover:bg-muted"
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
  const { t } = useTranslation();
  const aui = useAui();
  const attachments = usePromptInputAttachments();
  const chatOptions = useChatOptions();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isEmpty = draftText.length === 0 && attachments.files.length === 0;

  const stopRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  return (
    <PromptInputFooter className="flex-wrap border-t border-foreground/[0.075] !px-3 !py-2 dark:border-white/[0.08]">
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
          label={t("composer.mode")}
          onValueChange={chatOptions.setMode}
          options={chatOptions.modeOptions}
          value={chatOptions.mode}
        />
        {isRunning ? (
          <Button
            className="h-8 rounded-md border-foreground/[0.08] bg-background/55 px-3 text-xs focus-visible:!ring-0 dark:bg-card/60"
            onClick={stopRun}
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
          className="size-8 rounded-full p-0 shadow-none focus-visible:!ring-0 active:translate-y-px"
          disabled={isRunning || isEmpty}
          size="sm"
          type="submit"
        >
          <ArrowUp />
          <span className="sr-only">{t("common.send")}</span>
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
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const target = findPlanModeToggleTarget([
    {
      canSet: options.canSetMode,
      family: "agent",
      options: options.modeOptions,
      value: options.mode,
    },
    {
      canSet: options.canSetPermissionMode,
      family: "permission",
      options: options.permissionModeOptions,
      value: options.permissionMode,
    },
  ]);
  const unavailable =
    disabled || pending || options.configLoading || !target?.targetMode;
  const label = target?.isPlanMode ? t("composer.plan") : t("common.build");
  const title = target?.isPlanMode
    ? t("composer.switchToBuild", {
        defaultValue: "Switch to build mode",
      })
    : t("composer.switchToPlan", {
        defaultValue: "Switch to plan mode",
      });
  const Icon = target?.isPlanMode ? ListChecks : Hammer;

  return (
    <Button
      aria-pressed={Boolean(target?.isPlanMode)}
      className="h-8 gap-1.5 rounded-md px-2 text-xs focus-visible:!ring-0"
      disabled={unavailable}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!target?.targetMode) return;
        setPending(true);
        const setMode =
          target.family === "agent"
            ? options.setMode
            : options.setPermissionMode;
        void Promise.resolve(setMode(target.targetMode.value))
          .catch((error: unknown) => {
            toast({
              description: getErrorMessage(error),
              title: t("composer.toasts.couldNotChangeMode"),
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
    <div
      className={["relative w-fit max-w-36", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="pointer-events-none absolute top-1/2 left-2 z-10 flex size-4 -translate-y-1/2 items-center justify-center [&_svg]:size-3.5">
        {icon}
      </span>
      <NativeSelect
        aria-label={label}
        className="max-w-36"
        disabled={disabled}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        selectClassName="h-8 max-w-36 rounded-md border border-foreground/[0.08] bg-background/55 py-0 pr-8 pl-8 text-xs focus-visible:!border-foreground/12 focus-visible:!ring-0 dark:bg-card/60"
        size="sm"
        title={title ?? label}
        value={value}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function PromptAttachmentButton() {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();

  return (
    <Button
      className="focus-visible:!ring-0"
      onClick={attachments.openFileDialog}
      size="icon-sm"
      title={t("composer.attachFiles")}
      type="button"
      variant="ghost"
    >
      <Paperclip />
      <span className="sr-only">{t("composer.attachFiles")}</span>
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
  const { t } = useTranslation();
  const [modelQuery, setModelQuery] = useState("");
  const providerOptions = options.runtimeOptions;
  const providerLabel =
    AGENT_OPTIONS.find((agent) => agent.id === options.runtime)?.label ??
    options.runtime;
  const modelLabel = optionLabel(options.modelOptions, options.model);
  const effortLabel = optionLabel(
    options.reasoningEffortOptions,
    options.reasoningEffort,
  );
  const modeLabel = optionLabel(options.modeOptions, options.mode);
  const permissionModeLabel = optionLabel(
    options.permissionModeOptions,
    options.permissionMode,
  );
  const modelDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetModel ||
    options.modelOptionCount < 2;
  const effortDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetReasoningEffort ||
    options.reasoningEffortOptionCount < 2;
  const modeDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetMode ||
    options.modeOptionCount < 2;
  const permissionModeDisabled =
    disabled ||
    options.configLoading ||
    !options.canSetPermissionMode ||
    options.permissionModeOptionCount < 2;
  const effortDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetReasoningEffort,
        disabled,
        label: t("composer.settingLabels.reasoningEffort"),
        optionCount: options.reasoningEffortOptionCount,
        t,
      });
  const modelDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetModel,
        disabled,
        label: t("composer.model"),
        optionCount: options.modelOptionCount,
        t,
      });
  const modeDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetMode,
        disabled,
        label: t("composer.settingLabels.agentMode"),
        optionCount: options.modeOptionCount,
        t,
      });
  const permissionModeDisabledReason = options.configLoading
    ? undefined
    : composerSettingDisabledReason({
        canSet: options.canSetPermissionMode,
        disabled,
        label: t("composer.settingLabels.permissionMode"),
        optionCount: options.permissionModeOptionCount,
        t,
      });
  const providerDisabledReason =
    options.runtimeDisabledReason ??
    (providerOptions.every((provider) => provider.value === options.runtime)
      ? t("composer.disabledReasons.onlyOneAgent")
      : undefined) ??
    (disabled
      ? t("composer.disabledReasons.agentCannotChangeWhileRunning")
      : undefined);
  const providerDisabled =
    !options.canSetRuntime ||
    disabled ||
    providerOptions.every((provider) => provider.value === options.runtime);
  const filteredModelOptions = useMemo(
    () => filterComposerOptions(options.modelOptions, modelQuery),
    [options.modelOptions, modelQuery],
  );
  const effortDisplayLabel = shortEffortLabel(
    effortLabel,
    t("common.useDefault"),
    t("common.default"),
  );
  const modelEffortLabel = `${modelLabel} ${effortDisplayLabel}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("composer.provider")}
            className={`${composerModelMenuTriggerClassName} max-w-40`}
            size="sm"
            title={providerDisabledReason ?? t("composer.provider")}
            type="button"
            variant="ghost"
          >
            <Bot className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={composerModelMenuValueClassName}>
              {providerLabel}
            </span>
            <ComposerModelMenuChevron />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={`${composerNativeMenuClassName} w-52 min-w-0`}
          align="start"
          sideOffset={4}
          variant="native"
        >
          <DropdownMenuLabel className={composerNativeMenuLabelClassName}>
            {t("composer.provider")}
          </DropdownMenuLabel>
          {providerOptions.map((provider) => (
            <ComposerModelMenuItem
              disabled={providerDisabled}
              disabledReason={providerDisabledReason}
              key={provider.value}
              label={provider.label}
              onSelect={() => options.setRuntime(provider.value)}
              selected={provider.value === options.runtime}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`${t("composer.model")} / ${t("composer.effort")}`}
            className={`${composerModelMenuTriggerClassName} max-w-[18rem]`}
            size="sm"
            title={modelEffortLabel}
            type="button"
            variant="ghost"
          >
            <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 max-w-52 truncate text-muted-foreground">
              {modelEffortLabel}
            </span>
            <ComposerModelMenuChevron />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={`${composerNativeMenuClassName} w-[17rem] min-w-0`}
          align="start"
          sideOffset={4}
          variant="native"
        >
          <DropdownMenuLabel className={composerNativeMenuLabelClassName}>
            {t("composer.model")} / {t("composer.effort")}
          </DropdownMenuLabel>
          <ComposerModelMenuSub
            disabled={modelDisabled}
            disabledReason={modelDisabledReason}
            icon={<Cpu />}
            label={t("composer.model")}
            value={
              options.configLoading ? t("composer.loadingValue") : modelLabel
            }
          >
            <ComposerModelMenuSearch
              onChange={setModelQuery}
              placeholder={t("composer.searchModels")}
              value={modelQuery}
            />
            {filteredModelOptions.length > 0 ? (
              filteredModelOptions.map((model) => (
                <ComposerModelMenuItem
                  key={model.value}
                  label={model.label}
                  onSelect={() => {
                    options.setModel(model.value);
                    setModelQuery("");
                  }}
                  selected={model.value === options.model}
                />
              ))
            ) : (
              <div className="px-2 py-5 text-center text-xs text-muted-foreground">
                {t("composer.noModelsFound")}
              </div>
            )}
          </ComposerModelMenuSub>
          <ComposerModelMenuSub
            disabled={effortDisabled}
            disabledReason={effortDisabledReason}
            icon={<Brain />}
            label={t("composer.effort")}
            value={
              options.configLoading ? t("composer.loadingValue") : effortLabel
            }
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("composer.agentSettings")}
            className={`${composerModelMenuTriggerClassName} max-w-40`}
            size="sm"
            title={t("composer.agentSettings")}
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={composerModelMenuValueClassName}>
              {t("composer.agentSettings")}
            </span>
            <ComposerModelMenuChevron />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={`${composerNativeMenuClassName} w-[17rem] min-w-0`}
          align="start"
          sideOffset={4}
          variant="native"
        >
          <DropdownMenuLabel className={composerNativeMenuLabelClassName}>
            {t("composer.agentSettings")}
          </DropdownMenuLabel>
          <ComposerModelMenuSub
            disabled={modeDisabled}
            disabledReason={modeDisabledReason}
            icon={<SlidersHorizontal />}
            label={t("composer.agentMode")}
            value={
              options.configLoading ? t("composer.loadingValue") : modeLabel
            }
          >
            {options.modeOptions.map((mode) => (
              <ComposerModelMenuItem
                key={mode.value}
                label={mode.label}
                onSelect={() => options.setMode(mode.value)}
                selected={mode.value === options.mode}
              />
            ))}
          </ComposerModelMenuSub>
          <ComposerModelMenuSub
            disabled={permissionModeDisabled}
            disabledReason={permissionModeDisabledReason}
            icon={<ShieldCheck />}
            label={t("composer.permissionMode")}
            value={
              options.configLoading
                ? t("composer.loadingValue")
                : permissionModeLabel
            }
          >
            {options.permissionModeOptions.map((mode) => (
              <ComposerModelMenuItem
                key={mode.value}
                label={mode.label}
                onSelect={() => options.setPermissionMode(mode.value)}
                selected={mode.value === options.permissionMode}
              />
            ))}
          </ComposerModelMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function ComposerModelMenuChevron() {
  return (
    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-150 group-data-[state=open]/button:rotate-180" />
  );
}

function ComposerModelMenuSearch({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div
      className="sticky top-0 z-10 -mx-0.5 mb-1 bg-white/90 px-0.5 pb-1 backdrop-blur-xl dark:bg-card/95"
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          aria-label={placeholder}
          autoComplete="off"
          className="h-7 rounded-md border-0 bg-foreground/[0.055] pr-2 pl-8 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-ring/25 dark:bg-white/[0.07]"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
    </div>
  );
}

function ComposerModelMenuSub({
  children,
  disabled,
  disabledReason,
  icon,
  label,
  value,
}: {
  children: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const trigger = (
    <DropdownMenuSubTrigger
      className="min-h-7 w-full gap-2 rounded px-2 py-1 text-[13px] font-normal focus:bg-foreground/[0.055] focus:text-foreground data-open:bg-foreground/[0.055] data-open:text-foreground dark:focus:bg-white/[0.07] dark:data-open:bg-white/[0.07] [&>svg:last-child]:ml-1 [&>svg:last-child]:size-3.5 [&>svg:last-child]:opacity-45 focus:[&>svg:last-child]:opacity-65 data-open:[&>svg:last-child]:opacity-65"
      disabled={disabled}
      title={disabledReason ?? label}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="min-w-0 max-w-28 shrink truncate text-right text-[12px] text-muted-foreground">
        {value}
      </span>
    </DropdownMenuSubTrigger>
  );

  return (
    <DropdownMenuSub>
      {disabled && disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block rounded-lg">{trigger}</span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {disabledReason}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuSubContent
        className={`${composerNativeMenuClassName} max-h-72 w-[17rem] min-w-0`}
        sideOffset={4}
        variant="native"
      >
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ComposerModelMenuItem({
  disabled,
  disabledReason,
  label,
  onSelect,
  selected,
}: {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <DropdownMenuItem
      className="min-h-7 rounded px-2 py-1 text-[13px] font-normal focus:bg-foreground/[0.055] focus:text-foreground dark:focus:bg-white/[0.07]"
      disabled={disabled}
      onSelect={(event) => {
        event.preventDefault();
        if (!disabled && !selected) onSelect();
      }}
      title={disabledReason ?? label}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-primary">
        {selected ? <Check className="size-3" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenuItem>
  );
}

function optionLabel(options: AgentValueOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function filterComposerOptions(options: AgentValueOption[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery),
  );
}

function shortEffortLabel(
  label: string,
  defaultLabel: string,
  shortDefaultLabel: string,
) {
  return label.toLowerCase() === defaultLabel.toLowerCase()
    ? shortDefaultLabel
    : label;
}

function composerSettingDisabledReason({
  canSet,
  disabled,
  label,
  optionCount,
  t,
}: {
  canSet: boolean;
  disabled?: boolean;
  label: string;
  optionCount: number;
  t: TFunction;
}) {
  if (disabled) {
    return t("composer.disabledReasons.cannotChangeWhileRunning");
  }
  if (!canSet || optionCount === 0) {
    return t("composer.disabledReasons.cannotAdjust", { label });
  }
  if (optionCount < 2) {
    return t("composer.disabledReasons.onlyOneValue", { label });
  }
  return undefined;
}

function createAttachmentFromPromptFile(
  file: PromptInputMessage["files"][number],
  t: TFunction,
): CreateAttachment {
  const filename = file.filename ?? t("common.attachment");
  const mediaType = file.mediaType ?? "application/octet-stream";
  const url = file.url ?? "";
  const path = promptFilePath(file);
  const isImage = mediaType.startsWith("image/");

  if (!url || url.startsWith("blob:")) {
    throw new Error(t("composer.couldNotReadAttachment", { filename }));
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

function attachmentErrorTitle(
  code: AttachmentInputError["code"],
  t: TFunction,
) {
  switch (code) {
    case "accept":
      return t("composer.fileTypeBlocked");
    case "max_file_size":
      return t("composer.fileTooLarge");
    case "max_files":
      return t("composer.toasts.tooManyFiles");
    case "file_read":
      return t("composer.toasts.couldNotReadFile");
    case "submit":
      return t("composer.toasts.couldNotSendAttachment");
  }
}

function attachmentErrorMessage(
  code: AttachmentInputError["code"],
  t: TFunction,
) {
  switch (code) {
    case "accept":
      return t("composer.attachmentErrors.accept");
    case "max_file_size":
      return t("composer.attachmentErrors.maxFileSize");
    case "max_files":
      return t("composer.attachmentErrors.maxFiles");
    case "file_read":
      return t("composer.attachmentErrors.fileRead");
    case "submit":
      return t("composer.attachmentErrors.submit");
  }
}
