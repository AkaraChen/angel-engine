export const queryKeys = {
  agents: {
    skills: (runtime: string | null, projectPath: string | null) =>
      ["agents", "skills", runtime, projectPath] as const,
  },
  chatActivity: {
    all: () => ["chat-activity"] as const,
    list: () => ["chat-activity", "list"] as const,
  },
  chats: {
    all: () => ["chats"] as const,
    ambiguousRun: (id: string | null) =>
      ["chats", "ambiguous-run", id] as const,
    archived: () => ["chats", "archived"] as const,
    detail: (id: string | null) => ["chats", "detail", id] as const,
    details: () => ["chats", "detail"] as const,
    list: () => ["chats", "list"] as const,
    metadata: (id: string | null) => ["chats", "metadata", id] as const,
    prewarm: (runtime: string | null, projectId: string | null) =>
      ["chats", "prewarm", runtime, projectId] as const,
    runtimeConfig: (runtime: string | null, cwd: string | null) =>
      ["chats", "runtime-config", runtime, cwd] as const,
  },
  pathLauncher: {
    availability: () => ["path-launcher", "availability"] as const,
  },
  projects: {
    all: () => ["projects"] as const,
    detail: (id: string | null) => ["projects", "detail", id] as const,
    details: () => ["projects", "detail"] as const,
    fileSearch: (root: string, query: string, limit: number) =>
      ["projects", "file-search", root, query, limit] as const,
    list: () => ["projects", "list"] as const,
  },
  urlPreviews: {
    all: () => ["url-previews"] as const,
    detail: (url: string) => ["url-previews", "detail", url] as const,
  },
  usage: {
    snapshot: () => ["usage", "snapshot"] as const,
  },
  workspaceTools: {
    gitDiffRoot: (root: string | null) =>
      ["workspace-tools", "git-diff", root] as const,
    gitDiff: (
      root: string | null,
      baseKind = "worktree",
      baseRef: string | null = null,
      chatId: string | null = null,
    ) =>
      ["workspace-tools", "git-diff", root, baseKind, baseRef, chatId] as const,
    readFile: (root: string | null, path: string | null) =>
      ["workspace-tools", "read-file", root, path] as const,
  },
} as const;
