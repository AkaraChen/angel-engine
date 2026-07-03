export const queryKeys = {
  agents: {
    skills: (runtime: string | null, projectPath: string | null) =>
      ["agents", "skills", runtime, projectPath] as const,
  },
  chats: {
    all: () => ["chats"] as const,
    archived: () => ["chats", "archived"] as const,
    detail: (id: string | null) => ["chats", "detail", id] as const,
    details: () => ["chats", "detail"] as const,
    list: () => ["chats", "list"] as const,
    prewarm: (
      runtime: string | null,
      projectId: string | null,
      creationLocation: string,
    ) => ["chats", "prewarm", runtime, projectId, creationLocation] as const,
    runtimeConfig: (runtime: string | null, cwd: string | null) =>
      ["chats", "runtime-config", runtime, cwd] as const,
  },
  projects: {
    all: () => ["projects"] as const,
    detail: (id: string | null) => ["projects", "detail", id] as const,
    details: () => ["projects", "detail"] as const,
    fileSearch: (root: string, query: string, limit: number) =>
      ["projects", "file-search", root, query, limit] as const,
    gitStatus: (id: string | null) => ["projects", "git-status", id] as const,
    list: () => ["projects", "list"] as const,
  },
  workspaceTools: {
    fileTree: (root: string | null) =>
      ["workspace-tools", "file-tree", root] as const,
    gitDiff: (root: string | null) =>
      ["workspace-tools", "git-diff", root] as const,
    readFile: (root: string | null, path: string | null) =>
      ["workspace-tools", "read-file", root, path] as const,
  },
} as const;
