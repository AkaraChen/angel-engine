import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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
  useLocalRuntime,
  type Attachment,
  type ChatModelAdapter,
  type CompleteAttachment,
  type DictationAdapter,
  type EnrichedPartState,
  type FeedbackAdapter,
  type SpeechSynthesisAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import {
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clipboard,
  Code2,
  Copy,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Pencil,
  Quote,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  Workflow,
  X,
} from 'lucide-react';

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
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ipc } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import type { Project } from './shared/projects';

const primaryItems = [
  { label: 'New chat', icon: MessageSquarePlus },
  { label: 'Search', icon: Search },
  { label: 'Automation', icon: Workflow },
];

const initialMockMessages: readonly ThreadMessageLike[] = [
  {
    id: 'mock-user-setup',
    role: 'user',
    content:
      'Turn the desktop right pane into a production-feeling agent workspace mock.',
    createdAt: new Date('2026-05-03T09:30:00+08:00'),
  },
  {
    id: 'mock-assistant-setup',
    role: 'assistant',
    createdAt: new Date('2026-05-03T09:30:12+08:00'),
    metadata: {
      timing: {
        streamStartTime: 0,
        firstTokenTime: 318,
        totalStreamTime: 1760,
        tokenCount: 168,
        tokensPerSecond: 95,
        totalChunks: 7,
        toolCallCount: 1,
      },
      custom: {
        runId: 'run_desktop_mock',
        model: 'Mock Agent Pro',
      },
    },
    content: [
      {
        type: 'reasoning',
        text: 'Located SidebarInset as the right-pane boundary and kept the existing navigation untouched.',
      },
      {
        type: 'tool-call',
        toolCallId: 'tool-read-app',
        toolName: 'repo.read',
        args: {
          paths: ['desktop/src/App.tsx', 'desktop/package.json'],
        },
        argsText:
          '{"paths":["desktop/src/App.tsx","desktop/package.json"]}',
        result: {
          files: 2,
          boundary: 'SidebarInset',
          dependency: '@assistant-ui/react',
        },
      },
      {
        type: 'text',
        text:
          'The right pane is mocked as a full coding-agent workspace: streaming chat, action bars, branch controls, attachments, dictation, speech, feedback, quick prompts, and a run inspector all sit on assistant-ui primitives.',
      },
      {
        type: 'source',
        sourceType: 'url',
        id: 'source-thread',
        url: 'https://www.assistant-ui.com/docs/primitives/thread',
        title: 'assistant-ui Thread primitive',
      },
    ],
  },
];

const iconButtonClass =
  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
const messageActionFooterClass =
  'flex h-7 max-w-full shrink-0 flex-nowrap items-center gap-1 overflow-hidden';

const mockModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const prompt = getLastUserText(messages);
    const startedAt = Date.now();
    const toolArgs = {
      query: prompt || 'desktop agent workspace',
      scope: 'desktop/src',
      include: ['App.tsx', 'components/ui', 'package.json'],
    };
    const reasoning = {
      type: 'reasoning' as const,
      text: 'Mapping the request to the existing desktop shell, checking package capabilities, and preparing a bounded UI-only mock.',
    };
    const toolCall = {
      type: 'tool-call' as const,
      toolCallId: `mock-search-${startedAt}`,
      toolName: 'workspace.search',
      args: toolArgs,
      argsText: JSON.stringify(toolArgs),
      result: {
        matches: [
          'desktop/src/App.tsx',
          'desktop/src/components/ui/sidebar.tsx',
          'desktop/package.json',
        ],
        decision: 'Replace only the SidebarInset content.',
      },
    };
    const source = {
      type: 'source' as const,
      sourceType: 'url' as const,
      id: `assistant-ui-docs-${startedAt}`,
      url: 'https://www.assistant-ui.com/docs/runtimes/custom/local-runtime',
      title: 'assistant-ui LocalRuntime',
    };
    const response = [
      `I would treat "${prompt || 'the current request'}" as a UI shell task first: keep navigation stable, make the right pane feel like an agent cockpit, and leave backend wiring behind a local adapter.`,
      '',
      'Mock coverage in this run:',
      '- Streaming response with cumulative updates',
      '- Tool-call rendering with inputs and results',
      '- Editable user messages and regenerated assistant branches',
      '- Composer attachments, dictation, cancel, and quick prompts',
      '- Feedback, copy, export, speech, and run-inspector states',
      '',
      'The next real integration point is replacing the mock adapter with the engine session transport while keeping the primitives and layout intact.',
    ].join('\n');

    await waitForMockStep(180, abortSignal);
    if (abortSignal.aborted) return;
    yield { content: [reasoning] };

    await waitForMockStep(360, abortSignal);
    if (abortSignal.aborted) return;
    yield { content: [reasoning, toolCall] };

    let text = '';
    for (const chunk of response.match(/[\s\S]{1,80}/g) ?? []) {
      await waitForMockStep(90, abortSignal);
      if (abortSignal.aborted) return;
      text += chunk;
      yield {
        content: [reasoning, toolCall, { type: 'text', text }],
      };
    }

    yield {
      content: [reasoning, toolCall, { type: 'text', text }, source],
      metadata: {
        timing: {
          streamStartTime: startedAt,
          firstTokenTime: 540,
          totalStreamTime: Date.now() - startedAt,
          tokenCount: Math.max(96, Math.round(text.length / 4)),
          tokensPerSecond: 72,
          totalChunks: 8,
          toolCallCount: 1,
        },
        custom: {
          model: 'Mock Agent Pro',
          mode: 'desktop',
        },
      },
    };
  },
};

const mockFeedbackAdapter: FeedbackAdapter = {
  submit: () => undefined,
};

function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const adapters = useMemo(
    () => ({
      attachments: new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
      ]),
      dictation: createMockDictationAdapter(),
      feedback: mockFeedbackAdapter,
      speech: createMockSpeechAdapter(),
    }),
    []
  );

  const runtime = useLocalRuntime(mockModelAdapter, {
    adapters,
    initialMessages: initialMockMessages,
    maxSteps: 3,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
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
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

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

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await ipc.projectsChooseDirectory();
      if (!selectedPath) return;

      await ipc.projectsCreate({ path: selectedPath });
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

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader className="px-2 py-3">
          <SidebarMenu>
            {primaryItems.map(({ label, icon: Icon }) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton>
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

                {projects.map((project, index) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      isActive={index === 0}
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
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <MessageSquare />
                    <span className="truncate">Standalone thread</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4">
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

      <AppRuntimeProvider>
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />
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
        turnAnchor="top"
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

        <ThreadPrimitive.ScrollToBottom className="absolute bottom-4 right-6 z-10 inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground">
          <ArrowDown className="size-4" />
          <span className="sr-only">Scroll to bottom</span>
        </ThreadPrimitive.ScrollToBottom>
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
  return (
    <ComposerPrimitive.AttachmentDropzone className="rounded-md border border-dashed border-transparent bg-background data-[dragging]:border-primary data-[dragging]:bg-primary/5">
      <ComposerPrimitive.Root className="rounded-md border bg-card shadow-sm">
        <ComposerPrimitive.Quote className="m-2 flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 text-muted-foreground" />
          <ComposerPrimitive.QuoteDismiss className={iconButtonClass}>
            <X className="size-3.5" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>

        <ComposerPrimitive.Attachments>
          {({ attachment }) => (
            <ComposerAttachment attachment={attachment} key={attachment.id} />
          )}
        </ComposerPrimitive.Attachments>

        <ComposerPrimitive.Input
          cancelOnEscape
          className="max-h-36 min-h-16 w-full resize-none bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground"
          placeholder="Ask Angel Engine to inspect, patch, test, or explain..."
          rows={2}
          submitMode="enter"
        />

        <AuiIf condition={(state) => Boolean(state.composer.dictation)}>
          <div className="mx-3 mb-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Mic className="mr-1 inline size-3" />
            <ComposerPrimitive.DictationTranscript />
          </div>
        </AuiIf>

        <div className="flex items-center justify-between gap-2 border-t px-2 py-2">
          <div className="flex items-center gap-1">
            <ComposerPrimitive.AddAttachment asChild multiple>
              <Button size="icon-sm" type="button" variant="ghost">
                <Paperclip />
                <span className="sr-only">Attach files</span>
              </Button>
            </ComposerPrimitive.AddAttachment>
            <AuiIf condition={(state) => !state.composer.dictation}>
              <ComposerPrimitive.Dictate asChild>
                <Button size="icon-sm" type="button" variant="ghost">
                  <Mic />
                  <span className="sr-only">Start dictation</span>
                </Button>
              </ComposerPrimitive.Dictate>
            </AuiIf>
            <AuiIf condition={(state) => Boolean(state.composer.dictation)}>
              <ComposerPrimitive.StopDictation asChild>
                <Button size="icon-sm" type="button" variant="ghost">
                  <CircleStop />
                  <span className="sr-only">Stop dictation</span>
                </Button>
              </ComposerPrimitive.StopDictation>
            </AuiIf>
          </div>

          <div className="flex items-center gap-2">
            <AuiIf condition={(state) => state.thread.isRunning}>
              <ComposerPrimitive.Cancel asChild>
                <Button size="sm" type="button" variant="outline">
                  <CircleStop />
                  Cancel
                </Button>
              </ComposerPrimitive.Cancel>
            </AuiIf>
            <ComposerPrimitive.Send asChild>
              <Button size="sm" type="submit">
                <ArrowUp />
                Send
              </Button>
            </ComposerPrimitive.Send>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.AttachmentDropzone>
  );
}

function ComposerAttachment({ attachment }: { attachment: Attachment }) {
  return (
    <div className="mx-2 mt-2 inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{attachment.name}</span>
      <span className="text-muted-foreground">
        {attachment.status.type === 'running'
          ? `${Math.round(attachment.status.progress * 100)}%`
          : attachment.type}
      </span>
    </div>
  );
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
      <div className="flex max-w-[82%] flex-col items-start gap-1.5">
        <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm leading-6">
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
    return (
      <details className="mb-3 rounded-md border bg-background/60 p-2" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
          <BrainCircuit className="size-3.5" />
          Reasoning
        </summary>
        <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {part.text}
        </div>
      </details>
    );
  }

  if (part.type === 'tool-call') {
    return (
      <div className="my-3 overflow-hidden rounded-md border bg-background">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium">
            <Code2 className="size-3.5 shrink-0" />
            <span className="truncate">{part.toolName}</span>
          </span>
          <span className="rounded-sm bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-700">
            {part.status.type}
          </span>
        </div>
        <div className="grid gap-2 p-3 text-xs sm:grid-cols-2">
          <JsonBlock label="args" value={part.args} />
          <JsonBlock label="result" value={part.result ?? 'pending'} />
        </div>
      </div>
    );
  }

  if (part.type === 'source') {
    return (
      <a
        className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        href={part.url}
        rel="noreferrer"
        target="_blank"
      >
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate">{part.title ?? getHostname(part.url)}</span>
      </a>
    );
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

function getLastUserText(messages: readonly { role: string; content: readonly unknown[] }[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    return message.content
      .map((part) =>
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part
          ? String(part.text)
          : ''
      )
      .join('\n')
      .trim();
  }
  return '';
}

function getPartKey(part: EnrichedPartState) {
  if ('toolCallId' in part) return part.toolCallId;
  if ('id' in part && typeof part.id === 'string') return part.id;
  if ('text' in part) return `${part.type}-${part.text.slice(0, 24)}`;
  return part.type;
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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

function waitForMockStep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
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

function createMockDictationAdapter(): DictationAdapter {
  return {
    disableInputDuringDictation: false,
    listen() {
      const startListeners = new Set<() => void>();
      const endListeners = new Set<(result: DictationAdapter.Result) => void>();
      const speechListeners = new Set<(result: DictationAdapter.Result) => void>();
      const session: DictationAdapter.Session = {
        cancel() {
          stopTimers();
          session.status = { type: 'ended', reason: 'cancelled' };
        },
        onSpeech(callback) {
          speechListeners.add(callback);
          return () => speechListeners.delete(callback);
        },
        onSpeechEnd(callback) {
          endListeners.add(callback);
          return () => endListeners.delete(callback);
        },
        onSpeechStart(callback) {
          startListeners.add(callback);
          return () => startListeners.delete(callback);
        },
        status: { type: 'starting' },
        async stop() {
          stopTimers();
          finish('Draft a focused desktop agent status update.');
        },
      };

      const startTimer = window.setTimeout(() => {
        session.status = { type: 'running' };
        startListeners.forEach((listener) => listener());
        speechListeners.forEach((listener) =>
          listener({
            transcript: 'Draft a focused desktop agent',
          })
        );
      }, 120);
      const finishTimer = window.setTimeout(
        () => finish('Draft a focused desktop agent status update.'),
        1300
      );

      function stopTimers() {
        window.clearTimeout(startTimer);
        window.clearTimeout(finishTimer);
      }

      function finish(transcript: string) {
        stopTimers();
        session.status = { type: 'ended', reason: 'stopped' };
        const result = { transcript, isFinal: true };
        speechListeners.forEach((listener) => listener(result));
        endListeners.forEach((listener) => listener(result));
      }

      return session;
    },
  };
}
