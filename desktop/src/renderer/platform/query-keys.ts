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
    prewarm: (
      runtime: string | null,
      projectId: string | null,
      creationLocation: string,
    ) => ["chats", "prewarm", runtime, projectId, creationLocation] as const,
    runtimeConfig: (runtime: string | null, cwd: string | null) =>
      ["chats", "runtime-config", runtime, cwd] as const,
  },
  github: {
    items: (cwd: string | null, query: string) =>
      ["github", "items", cwd, query] as const,
    prChecks: (cwd: string | null) => ["github", "pr-checks", cwd] as const,
    pullRequestDetail: (cwd: string | null, number: number | null) =>
      ["github", "pull-request", cwd, number] as const,
    pullRequest: (cwd: string | null) =>
      ["github", "pull-request-status", cwd] as const,
    pullRequestTemplate: (cwd: string | null) =>
      ["github", "pull-request-template", cwd] as const,
    pullRequests: (cwd: string | null, state: string, query: string) =>
      ["github", "pull-requests", cwd, state, query] as const,
    repositories: (owner: string | null) =>
      ["github", "repositories", owner] as const,
    repositoryOwners: () => ["github", "repository-owners"] as const,
    resolve: (url: string | null) => ["github", "resolve", url] as const,
  },
  projects: {
    all: () => ["projects"] as const,
    config: (id: string | null) => ["projects", "config", id] as const,
    detail: (id: string | null) => ["projects", "detail", id] as const,
    details: () => ["projects", "detail"] as const,
    fileSearch: (root: string, query: string, limit: number) =>
      ["projects", "file-search", root, query, limit] as const,
    gitStatus: (id: string | null) => ["projects", "git-status", id] as const,
    list: () => ["projects", "list"] as const,
  },
  urlPreviews: {
    all: () => ["url-previews"] as const,
    detail: (url: string) => ["url-previews", "detail", url] as const,
  },
  usage: {
    snapshot: () => ["usage", "snapshot"] as const,
  },
  worktrees: {
    all: () => ["worktrees"] as const,
    lifecycle: (chatId: string | null) =>
      ["worktrees", "lifecycle", chatId] as const,
    managedEligible: () => ["worktrees", "managed", "eligible"] as const,
  },
  workspaceTools: {
    fileTree: (root: string | null) =>
      ["workspace-tools", "file-tree", root] as const,
    gitBranches: (root: string | null) =>
      ["workspace-tools", "git-branches", root] as const,
    gitCommitShow: (root: string | null, hash: string | null) =>
      ["workspace-tools", "git-commit-show", root, hash] as const,
    gitLog: (root: string | null) =>
      ["workspace-tools", "git-log", root] as const,
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
