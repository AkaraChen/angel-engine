import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ActionBarPrimitive,
  AuiIf,
  AssistantRuntimeProvider,
  BranchPickerPrimitive,
  ComposerPrimitive,
  CompositeAttachmentAdapter,
  MessagePrimitive,
  SelectionToolbarPrimitive,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  ThreadPrimitive,
  useAui,
  useAuiState,
  useLocalRuntime,
  type CompleteAttachment,
  type CreateAttachment,
  type EnrichedPartState,
  type FeedbackAdapter,
  type SpeechSynthesisAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import {
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clipboard,
  Copy,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Quote,
  RefreshCw,
  Settings,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  Workflow,
  X,
} from 'lucide-react';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { createEngineModelAdapter } from '@/lib/engine-model-adapter';
import { ipc } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import type { Chat, ChatHistoryMessage } from './shared/chat';
import type { Project } from './shared/projects';

const primaryItems = [
  { label: 'New chat', icon: MessageSquarePlus },
  { label: 'Automation', icon: Workflow },
];

const iconButtonClass =
  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
const messageActionFooterClass =
  'flex h-7 max-w-full shrink-0 flex-nowrap items-center gap-1 overflow-hidden';

const mockFeedbackAdapter: FeedbackAdapter = {
  submit: () => undefined,
};

function AppRuntimeProvider({
  chatId,
  children,
  historyMessages,
  historyRevision,
  onChatUpdated,
  projectId,
  projectPath,
}: {
  chatId?: string;
  children: ReactNode;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  onChatUpdated: (chat: Chat) => void;
  projectId?: string | null;
  projectPath?: string;
}) {
  const modelAdapter = useMemo(
    () =>
      createEngineModelAdapter({
        chatId,
        onChatUpdated,
        projectId,
        projectPath,
      }),
    [chatId, onChatUpdated, projectId, projectPath]
  );
  const adapters = useMemo(
    () => ({
      attachments: new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
      ]),
      feedback: mockFeedbackAdapter,
      speech: createMockSpeechAdapter(),
    }),
    []
  );

  const runtime = useLocalRuntime(modelAdapter, {
    adapters,
    maxSteps: 3,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadHistoryHydrator
        messages={historyMessages}
        revision={historyRevision}
      />
      {children}
    </AssistantRuntimeProvider>
  );
}

function ThreadHistoryHydrator({
  messages,
  revision,
}: {
  messages: ChatHistoryMessage[];
  revision: number;
}): null {
  const aui = useAui();
  const appliedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    const key = String(revision);
    if (appliedKey.current === key) return;

    appliedKey.current = key;
    aui.thread().reset(messages.map(toThreadMessageLike));
  }, [aui, messages, revision]);

  return null;
}

function toThreadMessageLike(message: ChatHistoryMessage): ThreadMessageLike {
  const createdAt = message.createdAt ? new Date(message.createdAt) : undefined;

  return {
    content: message.content,
    createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : undefined,
    id: message.id,
    role: message.role,
    status:
      message.role === 'assistant'
        ? {
            reason: 'stop',
            type: 'complete',
          }
        : undefined,
  };
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const toast = useToast();
  const isMacOS = window.desktopEnvironment.platform === 'darwin';
  const [chats, setChats] = useState<Chat[]>([]);
  const [historyMessages, setHistoryMessages] = useState<ChatHistoryMessage[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

  const upsertChat = useCallback((chat: Chat) => {
    setChats((current) => {
      const next = current.filter((item) => item.id !== chat.id);
      next.unshift(chat);
      return next.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      );
    });
    setSelectedChatId(chat.id);
  }, []);

  const refreshProjects = useCallback(async () => {
    setIsProjectsLoading(true);

    try {
      setProjects(await ipc.projectsList());
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not load projects',
        variant: 'destructive',
      });
    } finally {
      setIsProjectsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const loadChat = useCallback(
    async (chatId: string) => {
      setSelectedChatId(chatId);

      try {
        const result = await ipc.chatsLoad(chatId);
        upsertChat(result.chat);
        setHistoryMessages(result.messages);
        setHistoryRevision((revision) => revision + 1);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Could not load chat',
          variant: 'destructive',
        });
      }
    },
    [toast, upsertChat]
  );

  const refreshChats = useCallback(async () => {
    setIsChatsLoading(true);

    try {
      const nextChats = await ipc.chatsList();
      setChats(nextChats);
      if (!selectedChatId && nextChats.length > 0) {
        await loadChat(nextChats[0].id);
      }
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not load chats',
        variant: 'destructive',
      });
    } finally {
      setIsChatsLoading(false);
    }
  }, [loadChat, selectedChatId, toast]);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await ipc.projectsChooseDirectory();
      if (!selectedPath) return;

      const project = await ipc.projectsCreate({ path: selectedPath });
      setSelectedProjectId(project.id);
      await refreshProjects();
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not add project',
        variant: 'destructive',
      });
    }
  }, [refreshProjects, toast]);

  const showProjectContextMenu = useCallback(
    async (project: Project) => {
      try {
        const action = await ipc.projectsShowContextMenu(project.id);
        if (action === 'deleted') {
          await refreshProjects();
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Project action failed',
          variant: 'destructive',
        });
      }
    },
    [refreshProjects, toast]
  );

  const createChatForSelection = useCallback(async () => {
    try {
      const chat = await ipc.chatsCreate({
        cwd: selectedProject?.path,
        projectId: selectedProject?.id ?? null,
      });
      upsertChat(chat);
      setHistoryMessages([]);
      setHistoryRevision((revision) => revision + 1);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not create chat',
        variant: 'destructive',
      });
    }
  }, [selectedProject, toast, upsertChat]);

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader
          className="px-2 pb-3 pt-2"
          data-electron-drag
        >
          {isMacOS ? <div aria-hidden className="h-8 shrink-0" /> : null}
          <SidebarMenu>
            {primaryItems.map(({ label, icon: Icon }) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  onClick={
                    label === 'New chat' ? createChatForSelection : undefined
                  }
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <div className="flex items-center justify-between gap-2 pr-2">
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <div className="flex items-center gap-1">
                <Button
                  onClick={refreshProjects}
                  size="icon-xs"
                  title="Refresh projects"
                  type="button"
                  variant="ghost"
                >
                  <RefreshCw />
                  <span className="sr-only">Refresh projects</span>
                </Button>
                <Button
                  onClick={createProjectFromPicker}
                  size="icon-xs"
                  title="Add project"
                  type="button"
                  variant="ghost"
                >
                  <FolderPlus />
                  <span className="sr-only">Add project</span>
                </Button>
              </div>
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {isProjectsLoading ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <Loader2 className="animate-spin" />
                      <span>Loading projects</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {!isProjectsLoading && projects.length === 0 ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <Folder />
                      <span>No projects yet</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {projects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      isActive={project.id === selectedProjectId}
                      onClick={() => setSelectedProjectId(project.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void showProjectContextMenu(project);
                      }}
                      title={project.path}
                    >
                      <Folder />
                      <span className="truncate">
                        {getProjectDisplayName(project.path)}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isChatsLoading ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <Loader2 className="animate-spin" />
                      <span>Loading chats</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {!isChatsLoading && chats.length === 0 ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <MessageSquare />
                      <span>No chats yet</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {chats.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      isActive={chat.id === selectedChatId}
                      onClick={() => void loadChat(chat.id)}
                      title={chat.cwd ?? chat.title}
                    >
                      <MessageSquare />
                      <span className="truncate">{chat.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <AppRuntimeProvider
        chatId={selectedChatId}
        historyMessages={historyMessages}
        historyRevision={historyRevision}
        onChatUpdated={upsertChat}
        projectId={
          selectedChatId
            ? selectedChat?.projectId ?? null
            : selectedProject?.id ?? null
        }
        projectPath={
          selectedChatId
            ? selectedChat?.cwd ?? undefined
            : selectedProject?.path
        }
      >
        <SidebarInset className="h-svh max-h-svh overflow-hidden md:h-[calc(100svh-1rem)] md:max-h-[calc(100svh-1rem)]">
          <WorkspaceHeader />
          <main className="flex min-h-0 flex-1 overflow-hidden">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <AssistantThread />
            </section>
          </main>
        </SidebarInset>
      </AppRuntimeProvider>
    </SidebarProvider>
  );
}

function WorkspaceHeader() {
  return (
    <header
      className="flex h-14 shrink-0 items-center gap-3 border-b px-4"
      data-electron-drag
    >
      <h1 className="min-w-0 truncate text-sm font-medium">
        Angel Engine Assistant
      </h1>
    </header>
  );
}

function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
      <ThreadPrimitive.Viewport
        className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-6"
        scrollToBottomOnRunStart
      >
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <EmptyThread />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.role === 'user') {
              if (message.composer.isEditing) return <UserEditComposer />;
              return <UserMessage />;
            }
            return <AssistantMessage />;
          }}
        </ThreadPrimitive.Messages>

        <SelectionToolbarPrimitive.Root className="z-20 flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <SelectionToolbarPrimitive.Quote className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted">
            <Quote className="size-3" />
            Quote
          </SelectionToolbarPrimitive.Quote>
        </SelectionToolbarPrimitive.Root>
      </ThreadPrimitive.Viewport>
      <div className="shrink-0 bg-background px-4 pb-4 pt-2 sm:px-6">
        <AssistantComposer />
      </div>
    </ThreadPrimitive.Root>
  );
}

function EmptyThread() {
  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-5 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-md border bg-muted/40">
        <Sparkles className="size-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Start a desktop run</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the workspace slice to inspect.
        </p>
      </div>
    </div>
  );
}

function AssistantComposer() {
  const aui = useAui();
  const canCancel = useAuiState((state) => state.composer.canCancel);
  const isInputDisabled = useAuiState((state) => state.thread.isDisabled);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [draftText, setDraftText] = useState('');

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const composer = aui.composer();
      const text = message.text.trim() ? message.text : '';

      composer.setText(text);

      for (const file of message.files) {
        await composer.addAttachment(createAttachmentFromPromptFile(file));
      }

      if (!composer.getState().isEmpty) {
        composer.send();
        setDraftText('');
      }
    },
    [aui]
  );

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftText(event.currentTarget.value);
    },
    []
  );

  const handleTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape' && canCancel) {
        event.preventDefault();
        aui.composer().cancel();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && isRunning) {
        event.preventDefault();
      }
    },
    [aui, canCancel, isRunning]
  );

  return (
    <PromptInput
      inputGroupClassName="!rounded-md !border !border-border !bg-card shadow-sm has-[textarea]:!rounded-md has-[>[data-align=block-end]]:!rounded-md has-[>[data-align=block-start]]:!rounded-md"
      multiple
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
          {attachments.files.map((file) => (
            <button
              className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              key={file.id}
              onClick={() => attachments.remove(file.id)}
              type="button"
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{file.filename ?? 'Attachment'}</span>
              <X className="size-3.5 shrink-0" />
            </button>
          ))}
        </div>
      ) : null}
    </PromptInputHeader>
  );
}

function AssistantComposerFooter({ draftText }: { draftText: string }) {
  const aui = useAui();
  const attachments = usePromptInputAttachments();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isEmpty =
    draftText.trim().length === 0 && attachments.files.length === 0;

  const stopRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  return (
    <PromptInputFooter className="border-t !px-2 !py-2">
      <PromptInputTools>
        <PromptAttachmentButton />
      </PromptInputTools>
      <div className="flex items-center gap-2">
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

function createAttachmentFromPromptFile(
  file: PromptInputMessage['files'][number]
): CreateAttachment {
  const filename = file.filename ?? 'Attachment';
  const mediaType = file.mediaType ?? 'application/octet-stream';
  const url = file.url ?? '';
  const isImage = mediaType.startsWith('image/');

  return {
    content: [
      isImage
        ? {
            filename,
            image: url,
            type: 'image',
          }
        : {
            data: url,
            filename,
            mimeType: mediaType,
            type: 'file',
          },
    ],
    contentType: mediaType,
    name: filename,
    type: isImage ? 'image' : 'file',
  };
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="group flex justify-end">
      <div className="flex max-w-[78%] flex-col items-end gap-1.5">
        <MessagePrimitive.Attachments>
          {({ attachment }) => (
            <MessageAttachment attachment={attachment} key={attachment.id} />
          )}
        </MessagePrimitive.Attachments>
        <div className="rounded-md bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground">
          <MessageParts />
        </div>
        <div className={messageActionFooterClass}>
          <MessageBranchPicker />
          <ActionBarPrimitive.Root
            autohide="not-last"
            autohideFloat="always"
            className="flex gap-0.5 data-[floating]:opacity-0 data-[floating]:transition-opacity group-hover:data-[floating]:opacity-100"
            hideWhenRunning
          >
            <ActionBarPrimitive.Edit className={iconButtonClass}>
              <Pencil className="size-3.5" />
              <span className="sr-only">Edit</span>
            </ActionBarPrimitive.Edit>
            <ActionBarPrimitive.Copy className={cn(iconButtonClass, 'group/copy')}>
              <Copy className="size-3.5 group-data-[copied]/copy:hidden" />
              <Check className="hidden size-3.5 group-data-[copied]/copy:block" />
              <span className="sr-only">Copy</span>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function UserEditComposer() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <ComposerPrimitive.Root className="w-full max-w-[78%] rounded-md border bg-background p-2 shadow-sm">
        <ComposerPrimitive.Input className="min-h-24 w-full resize-none rounded-sm bg-muted/30 px-3 py-2 text-sm outline-none" />
        <div className="mt-2 flex justify-end gap-2">
          <ComposerPrimitive.Cancel asChild>
            <Button size="sm" type="button" variant="ghost">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" type="submit">
              <Check />
              Save
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex justify-start">
      <div className="flex w-full max-w-[82%] flex-col items-start gap-1.5 text-sm leading-6">
        <div className="w-full">
          <MessageParts />
        </div>
        <div className={messageActionFooterClass}>
          <MessageBranchPicker />
          <ActionBarPrimitive.Root
            autohide="not-last"
            autohideFloat="always"
            className="flex gap-0.5 data-[floating]:opacity-0 data-[floating]:transition-opacity group-hover:data-[floating]:opacity-100"
            hideWhenRunning
          >
            <ActionBarPrimitive.Copy className={cn(iconButtonClass, 'group/copy')}>
              <Copy className="size-3.5 group-data-[copied]/copy:hidden" />
              <Check className="hidden size-3.5 group-data-[copied]/copy:block" />
              <span className="sr-only">Copy</span>
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload className={iconButtonClass}>
              <RefreshCw className="size-3.5" />
              <span className="sr-only">Reload</span>
            </ActionBarPrimitive.Reload>
            <AuiIf condition={(state) => !state.message.speech}>
              <ActionBarPrimitive.Speak className={iconButtonClass}>
                <Volume2 className="size-3.5" />
                <span className="sr-only">Speak</span>
              </ActionBarPrimitive.Speak>
            </AuiIf>
            <AuiIf condition={(state) => Boolean(state.message.speech)}>
              <ActionBarPrimitive.StopSpeaking className={iconButtonClass}>
                <VolumeX className="size-3.5" />
                <span className="sr-only">Stop speaking</span>
              </ActionBarPrimitive.StopSpeaking>
            </AuiIf>
            <ActionBarPrimitive.FeedbackPositive
              className={cn(
                iconButtonClass,
                'data-[submitted]:bg-emerald-500/10 data-[submitted]:text-emerald-700'
              )}
            >
              <ThumbsUp className="size-3.5" />
              <span className="sr-only">Helpful</span>
            </ActionBarPrimitive.FeedbackPositive>
            <ActionBarPrimitive.FeedbackNegative
              className={cn(
                iconButtonClass,
                'data-[submitted]:bg-rose-500/10 data-[submitted]:text-rose-700'
              )}
            >
              <ThumbsDown className="size-3.5" />
              <span className="sr-only">Not helpful</span>
            </ActionBarPrimitive.FeedbackNegative>
            <ActionBarPrimitive.ExportMarkdown
              className={iconButtonClass}
              onExport={(content) => navigator.clipboard.writeText(content)}
            >
              <Clipboard className="size-3.5" />
              <span className="sr-only">Export Markdown</span>
            </ActionBarPrimitive.ExportMarkdown>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function MessageBranchPicker() {
  return (
    <BranchPickerPrimitive.Root
      className="inline-flex h-7 items-center gap-0.5 rounded-md border bg-background px-1 text-xs text-muted-foreground"
      hideWhenSingleBranch
    >
      <BranchPickerPrimitive.Previous className="inline-flex size-5 items-center justify-center rounded-sm hover:bg-muted disabled:opacity-40">
        <ChevronLeft className="size-3" />
      </BranchPickerPrimitive.Previous>
      <span className="min-w-8 text-center tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next className="inline-flex size-5 items-center justify-center rounded-sm hover:bg-muted disabled:opacity-40">
        <ChevronRight className="size-3" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function MessageParts() {
  return (
    <MessagePrimitive.Parts>
      {renderMessagePart}
    </MessagePrimitive.Parts>
  );
}

function renderMessagePart({ part }: { part: EnrichedPartState }) {
  return <MessagePart key={getPartKey(part)} part={part} />;
}

function MessagePart({ part }: { part: EnrichedPartState }) {
  if (part.type === 'text') {
    if (part.status.type === 'running' && !part.text) {
      return (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Thinking
        </span>
      );
    }
    return <div className="whitespace-pre-wrap">{part.text}</div>;
  }

  if (part.type === 'reasoning') {
    if (!part.text.trim()) return null;

    return (
      <div className="mb-3 w-full text-muted-foreground">
        <div className="flex items-center gap-2 text-xs font-medium">
          <BrainCircuit className="size-3.5" />
          Reasoning
        </div>
        <div className="mt-2 whitespace-pre-wrap border-l border-border pl-3 text-xs leading-5">
          {part.text}
        </div>
      </div>
    );
  }

  if (part.type === 'tool-call') {
    return null;
  }

  if (part.type === 'source') {
    return null;
  }

  if (part.type === 'image') {
    return (
      <img
        alt={part.filename ?? 'image attachment'}
        className="my-2 max-h-80 rounded-md border object-contain"
        src={part.image}
      />
    );
  }

  if (part.type === 'file') {
    return (
      <div className="my-2 inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
        <FileText className="size-3.5" />
        {part.filename ?? part.mimeType}
      </div>
    );
  }

  if (part.type === 'data') {
    return <JsonBlock label={part.name} value={part.data} />;
  }

  return null;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 p-2">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function MessageAttachment({ attachment }: { attachment: CompleteAttachment }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{attachment.name}</span>
      <span className="text-muted-foreground">{attachment.type}</span>
    </div>
  );
}

function getPartKey(part: EnrichedPartState) {
  if ('toolCallId' in part) return part.toolCallId;
  if ('id' in part && typeof part.id === 'string') return part.id;
  if ('text' in part) return part.type;
  return part.type;
}

function getProjectDisplayName(projectPath: string) {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function createMockSpeechAdapter(): SpeechSynthesisAdapter {
  return {
    speak() {
      const listeners = new Set<() => void>();
      const utterance: SpeechSynthesisAdapter.Utterance = {
        cancel() {
          window.clearTimeout(startTimeout);
          window.clearTimeout(endTimeout);
          utterance.status = { type: 'ended', reason: 'cancelled' };
          listeners.forEach((listener) => listener());
        },
        status: { type: 'starting' },
        subscribe(callback) {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
      };
      const startTimeout = window.setTimeout(() => {
        utterance.status = { type: 'running' };
        listeners.forEach((listener) => listener());
      }, 120);
      const endTimeout = window.setTimeout(() => {
        utterance.status = { type: 'ended', reason: 'finished' };
        listeners.forEach((listener) => listener());
      }, 2200);
      return utterance;
    },
  };
}
