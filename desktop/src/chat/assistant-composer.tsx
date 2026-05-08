import {
  useCallback,
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
  Paperclip,
  Quote,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { ChatAttachmentTile } from "@/chat/attachment-tile";
import {
  useChatOptions,
  type ChatOptionsContextValue,
} from "@/chat/chat-options-context";
import { findBuildModeOption, findPlanModeOption } from "@/chat/mode-options";
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
import { iconButtonClass } from "@/chat/thread-styles";
import {
  AGENT_OPTIONS,
  normalizeAgentRuntime,
  type AgentValueOption,
} from "@/shared/agents";
import { useToast } from "@/components/ui/toast";

export function AssistantComposer() {
  const aui = useAui();
  const canCancel = useAuiState((state) => state.composer.canCancel);
  const isInputDisabled = useAuiState((state) => state.thread.isDisabled);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const toast = useToast();
  const [draftText, setDraftText] = useState("");

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text.trim() ? message.text : "";
      const hasMessage = text.length > 0 || message.files.length > 0;
      if (!hasMessage) {
        return;
      }

      const composer = aui.composer();

      composer.setText(text);

      try {
        await Promise.all(
          message.files.map((file) =>
            composer.addAttachment(createAttachmentFromPromptFile(file)),
          ),
        );

        await composer.send();
        setDraftText("");
      } catch (error) {
        await composer.clearAttachments().catch(() => undefined);
        throw error;
      }
    },
    [aui],
  );

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

  const handleTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape" && canCancel) {
        event.preventDefault();
        aui.composer().cancel();
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && isRunning) {
        event.preventDefault();
      }
    },
    [aui, canCancel, isRunning],
  );

  return (
    <PromptInput
      inputGroupClassName="!rounded-md !border !border-border !bg-card shadow-sm has-[textarea]:!rounded-md has-[>[data-align=block-end]]:!rounded-md has-[>[data-align=block-start]]:!rounded-md"
      multiple
      onError={handleAttachmentError}
      onSubmit={handleSubmit}
    >
      <AssistantComposerHeader />

      <PromptInputBody>
        <PromptInputTextarea
          className="max-h-36 min-h-16 text-sm leading-6"
          disabled={isInputDisabled}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          placeholder="Ask Angel Engine to inspect, patch, test, or explain..."
          rows={2}
          value={draftText}
        />
      </PromptInputBody>

      <AssistantComposerFooter draftText={draftText} />
    </PromptInput>
  );
}

function AssistantComposerHeader() {
  const attachments = usePromptInputAttachments();
  const hasQuote = useAuiState((state) => Boolean(state.composer.quote));

  if (!hasQuote && attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className="flex-col items-stretch gap-2 !px-2 !py-2">
      {hasQuote ? (
        <ComposerPrimitive.Quote className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 text-muted-foreground" />
          <ComposerPrimitive.QuoteDismiss className={iconButtonClass}>
            <X className="size-3.5" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>
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

function AssistantComposerFooter({ draftText }: { draftText: string }) {
  const aui = useAui();
  const attachments = usePromptInputAttachments();
  const chatOptions = useChatOptions();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isEmpty =
    draftText.trim().length === 0 && attachments.files.length === 0;

  const stopRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  return (
    <PromptInputFooter className="flex-wrap border-t !px-2 !py-2">
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
          <Button onClick={stopRun} size="sm" type="button" variant="outline">
            <CircleStop />
            Cancel
          </Button>
        ) : null}
        <Button disabled={isRunning || isEmpty} size="sm" type="submit">
          <ArrowUp />
          Send
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
      className="h-8 gap-1.5 rounded-md px-2 text-xs"
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
          "h-8 max-w-36 rounded-md border border-border bg-background/70 px-2 text-xs",
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
          className="h-8 max-w-[22rem] gap-1.5 rounded-md border border-border bg-background/70 px-2 text-xs"
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
              onSelect={() =>
                options.setRuntime(normalizeAgentRuntime(provider.value))
              }
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

function promptFilePath(file: PromptInputMessage["files"][number]) {
  const path = file.path;
  return typeof path === "string" && path.trim() ? path.trim() : undefined;
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
