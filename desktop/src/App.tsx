import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  Circle,
  Clock3,
  Code2,
  Command,
  FolderGit2,
  GitBranch,
  History,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Project = {
  id: string;
  name: string;
  repo: string;
  path: string;
  branch: string;
  status: 'clean' | 'dirty' | 'ahead';
  color: string;
  updatedAt: string;
};

type Chat = {
  id: string;
  title: string;
  preview: string;
  projectId?: string;
  updatedAt: string;
  model: string;
};

const projects: Project[] = [
  {
    id: 'angel-engine',
    name: 'Angel Engine',
    repo: 'local/angel-engine',
    path: '~/Developer/angel-engine',
    branch: 'master',
    status: 'dirty',
    color: 'bg-sky-500',
    updatedAt: 'now',
  },
  {
    id: 'agent-client',
    name: 'Agent Client Protocol',
    repo: 'vendor/agent-client-protocol',
    path: 'crates/angel-engine/vendor/agent-client-protocol',
    branch: 'main',
    status: 'clean',
    color: 'bg-emerald-500',
    updatedAt: '1h ago',
  },
  {
    id: 'desktop',
    name: 'Desktop Shell',
    repo: 'local/desktop',
    path: './desktop',
    branch: 'master',
    status: 'ahead',
    color: 'bg-violet-500',
    updatedAt: 'draft',
  },
];

const initialChats: Chat[] = [
  {
    id: 'chat-desktop-shell',
    title: 'Design desktop shell',
    preview: 'Build a focused chat UI around repository context.',
    projectId: 'desktop',
    updatedAt: '2m',
    model: 'local placeholder',
  },
  {
    id: 'chat-engine-bridge',
    title: 'Bridge runtime notes',
    preview: 'Map renderer actions to engine-side commands.',
    projectId: 'angel-engine',
    updatedAt: '18m',
    model: 'local placeholder',
  },
  {
    id: 'chat-general',
    title: 'General chat',
    preview: 'Unbound workspace conversation.',
    updatedAt: '1h',
    model: 'local placeholder',
  },
];

const placeholderModelAdapter: ChatModelAdapter = {
  async run({ messages, abortSignal }) {
    await delay(420, abortSignal);

    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');
    const prompt =
      lastUserMessage?.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join(' ')
        .trim() || 'your request';

    return {
      content: [
        {
          type: 'text',
          text: `Placeholder assistant response for: "${truncate(prompt, 96)}"\n\nThis thread is wired through @assistant-ui/react. Connect the adapter to your engine or API when the backend contract is ready.`,
        },
      ],
    };
  },
};

function delay(ms: number, abortSignal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (abortSignal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = window.setTimeout(resolve, ms);
    abortSignal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function App() {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState(initialChats[0].id);
  const [activeProjectId, setActiveProjectId] = useState('desktop');

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const selectedProject = projects.find((project) => project.id === activeProjectId);
  const activeChatProject = activeChat.projectId
    ? projects.find((project) => project.id === activeChat.projectId)
    : undefined;

  const unboundChats = chats.filter((chat) => !chat.projectId);

  const createChat = (projectId?: string) => {
    const project = projects.find((item) => item.id === projectId);
    const nextChat: Chat = {
      id: `chat-${projectId ?? 'workspace'}-${Date.now()}`,
      title: project ? `New chat in ${project.name}` : 'New workspace chat',
      preview: project
        ? `Repository context attached from ${project.repo}.`
        : 'No repository context attached yet.',
      projectId,
      updatedAt: 'now',
      model: 'local placeholder',
    };

    setChats((current) => [nextChat, ...current]);
    setActiveChatId(nextChat.id);
    if (projectId) setActiveProjectId(projectId);
  };

  const selectChat = (chat: Chat) => {
    setActiveChatId(chat.id);
    if (chat.projectId) setActiveProjectId(chat.projectId);
  };

  return (
    <main className="h-screen overflow-hidden bg-muted/40 text-foreground">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r bg-background">
          <SidebarHeader />

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <SearchBox />

            <section className="mt-4">
              <SectionTitle
                title="Chats"
                action={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Create workspace chat"
                    onClick={() => createChat()}
                  >
                    <Plus className="size-4" />
                  </Button>
                }
              />
              <div className="mt-2 grid gap-1">
                {chats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    project={projects.find((item) => item.id === chat.projectId)}
                    active={chat.id === activeChat.id}
                    onSelect={() => selectChat(chat)}
                  />
                ))}
                {unboundChats.length === 0 && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    No loose workspace chats.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-6">
              <SectionTitle title="Projects" />
              <div className="mt-2 grid gap-2">
                {projects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    chatCount={
                      chats.filter((chat) => chat.projectId === project.id).length
                    }
                    active={project.id === selectedProject?.id}
                    onSelect={() => setActiveProjectId(project.id)}
                    onCreateChat={() => createChat(project.id)}
                  />
                ))}
              </div>
            </section>
          </div>

          <SidebarFooter />
        </aside>

        <AssistantChatPanel
          key={activeChat.id}
          chat={activeChat}
          project={activeChatProject}
          selectedProject={selectedProject}
          onCreateProjectChat={() => createChat(activeChat.projectId ?? selectedProject?.id)}
        />
      </div>
    </main>
  );
}

function SidebarHeader() {
  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">Angel Engine</h1>
            <p className="truncate text-xs text-muted-foreground">
              Agent workspace
            </p>
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Toggle sidebar">
          <PanelLeft className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function SearchBox() {
  return (
    <label className="flex h-9 items-center gap-2 rounded-lg border bg-muted/35 px-3 text-sm text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
      <Search className="size-4" aria-hidden="true" />
      <input
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        placeholder="Search chats and repos"
        type="search"
      />
      <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        K
      </kbd>
    </label>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-2 px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {action}
    </div>
  );
}

function ChatListItem({
  chat,
  project,
  active,
  onSelect,
}: {
  chat: Chat;
  project?: Project;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        'group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
        active
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      type="button"
      onClick={onSelect}
    >
      <div
        className={cn(
          'mt-0.5 flex size-7 items-center justify-center rounded-md',
          active ? 'bg-background' : 'bg-muted',
        )}
      >
        <MessageSquare className="size-3.5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{chat.title}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {chat.preview}
        </div>
        {project && (
          <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', project.color)} />
            <span className="truncate">{project.repo}</span>
          </div>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground">{chat.updatedAt}</span>
    </button>
  );
}

function ProjectListItem({
  project,
  chatCount,
  active,
  onSelect,
  onCreateChat,
}: {
  project: Project;
  chatCount: number;
  active: boolean;
  onSelect: () => void;
  onCreateChat: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-2.5 transition-colors',
        active && 'border-ring/60 shadow-sm',
      )}
    >
      <button
        type="button"
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 text-left"
        onClick={onSelect}
      >
        <span className={cn('mt-1 size-2 rounded-full', project.color)} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {project.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {project.path}
          </span>
        </span>
        <StatusBadge status={project.status} />
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <GitBranch className="size-3" />
          <span className="truncate">{project.branch}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="size-3" />
          {chatCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3" />
          {project.updatedAt}
        </span>
      </div>

      <Button
        className="mt-3 w-full justify-start"
        size="sm"
        variant={active ? 'secondary' : 'outline'}
        onClick={onCreateChat}
      >
        <Plus data-icon="inline-start" className="size-3.5" />
        Chat in repo
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: Project['status'] }) {
  const label = {
    clean: 'Clean',
    dirty: 'Dirty',
    ahead: 'Ahead',
  }[status];

  return (
    <Badge
      variant={status === 'dirty' ? 'destructive' : 'outline'}
      className="capitalize"
    >
      {status === 'clean' ? (
        <CheckCircle2 data-icon="inline-start" className="size-3" />
      ) : (
        <Circle data-icon="inline-start" className="size-3" />
      )}
      {label}
    </Badge>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t p-3">
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">Local mode</div>
          <div className="truncate text-xs text-muted-foreground">
            Placeholder assistant adapter
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Open settings">
          <Settings2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function AssistantChatPanel({
  chat,
  project,
  selectedProject,
  onCreateProjectChat,
}: {
  chat: Chat;
  project?: Project;
  selectedProject?: Project;
  onCreateProjectChat: () => void;
}) {
  const runtime = useLocalRuntime(placeholderModelAdapter);
  const subtitle = project ? `${project.repo} on ${project.branch}` : 'No repo';
  const repoButtonLabel = project ?? selectedProject ? 'Repo chat' : 'Pick repo';

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="flex min-h-0 flex-col bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Bot className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{chat.title}</h2>
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {project && (
              <Badge variant="secondary">
                <FolderGit2 data-icon="inline-start" className="size-3" />
                {project.name}
              </Badge>
            )}
            <Badge variant="outline">
              <Code2 data-icon="inline-start" className="size-3" />
              {chat.model}
            </Badge>
            <Button size="sm" variant="outline" onClick={onCreateProjectChat}>
              <Plus data-icon="inline-start" className="size-3.5" />
              {repoButtonLabel}
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="More actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </div>
        </div>

        <AssistantThread chat={chat} project={project} />
      </section>
    </AssistantRuntimeProvider>
  );
}

function AssistantThread({ chat, project }: { chat: Chat; project?: Project }) {
  const suggestions = useMemo(
    () => [
      project
        ? `Summarize the ${project.name} repository structure`
        : 'Help me plan a new workspace task',
      project
        ? `Find a good place to add a chat persistence layer in ${project.repo}`
        : 'Create a checklist for a new project chat',
      'Draft an implementation plan for repository-aware chats',
      'Explain what the current placeholder adapter should connect to next',
    ],
    [project],
  );

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-5 py-5">
          <AuiIf condition={(state) => state.thread.isEmpty}>
            <ThreadWelcome chat={chat} project={project} suggestions={suggestions} />
          </AuiIf>

          <div className="flex flex-col gap-5 empty:hidden">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-background/95 pb-5 pt-4 backdrop-blur">
            <ThreadPrimitive.ScrollToBottom asChild>
              <Button
                className="absolute -top-8 left-1/2 size-8 -translate-x-1/2 rounded-full shadow-sm"
                size="icon"
                variant="outline"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="size-4" />
              </Button>
            </ThreadPrimitive.ScrollToBottom>
            <Composer project={project} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function ThreadWelcome({
  chat,
  project,
  suggestions,
}: {
  chat: Chat;
  project?: Project;
  suggestions: string[];
}) {
  return (
    <div className="flex flex-1 flex-col justify-center py-8">
      <div className="max-w-2xl">
        <Badge variant="outline">
          <Command data-icon="inline-start" className="size-3" />
          {project ? 'Repository context attached' : 'Workspace chat'}
        </Badge>
        <h3 className="mt-4 text-3xl font-semibold tracking-normal">
          {project ? `Chat with ${project.name}` : chat.title}
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          The assistant surface is wired through assistant-ui with a local
          placeholder model adapter. Use the composer to test thread behavior
          before connecting the engine backend.
        </p>
      </div>

      <div className="mt-8 grid gap-2 md:grid-cols-2">
        {suggestions.map((suggestion) => (
          <ThreadPrimitive.Suggestion
            key={suggestion}
            prompt={suggestion}
            send
            asChild
          >
            <Button
              className="h-auto justify-start whitespace-normal rounded-lg border bg-card px-3 py-3 text-left text-sm"
              variant="ghost"
            >
              <Sparkles
                data-icon="inline-start"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span className="min-w-0">{suggestion}</span>
            </Button>
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
}

function ThreadMessage() {
  const role = useAuiState((state) => state.message.role);
  const isUser = role === 'user';

  return (
    <MessagePrimitive.Root
      className={cn(
        'flex w-full gap-3',
        isUser ? 'justify-end' : 'justify-start',
      )}
      data-role={role}
    >
      {!isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border bg-card text-card-foreground',
        )}
      >
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer({ project }: { project?: Project }) {
  return (
    <ComposerPrimitive.Root className="rounded-lg border bg-card p-2 shadow-sm">
      <ComposerPrimitive.Input
        aria-label="Message"
        className="max-h-36 min-h-14 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
        placeholder={
          project
            ? `Ask about ${project.repo}, files, branches, or implementation work...`
            : 'Ask anything, or choose a repository from Projects...'
        }
        rows={2}
        submitMode="enter"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-1 pt-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            <History data-icon="inline-start" className="size-3" />
            Thread local
          </Badge>
          {project && (
            <Badge variant="secondary">
              <GitBranch data-icon="inline-start" className="size-3" />
              {project.branch}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <Button size="sm" type="button">
                <ArrowUp data-icon="inline-start" className="size-3.5" />
                Send
              </Button>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(state) => state.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button size="sm" type="button" variant="destructive">
                <Square data-icon="inline-start" className="size-3.5" />
                Stop
              </Button>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
