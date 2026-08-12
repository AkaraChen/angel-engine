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
    pullRequest: (cwd: string | null) =>
      ["github", "pull-request-status", cwd] as const,
    repositories: (owner: string | null) =>
      ["github", "repositories", owner] as const,
    repositoryOwners: () => ["github", "repository-owners"] as const,
  },
  sourceControl: {
    all: () => ["source-control"] as const,
    activation: (projectId: string | null) =>
      ["source-control", "activation", projectId] as const,
    links: (providerIdentity: string | null, url: string | null) =>
      ["source-control", providerIdentity, "links", url] as const,
    namespaces: (
      providerIdentity: string | null,
      query: string | null = null,
      limit = 50,
    ) =>
      ["source-control", providerIdentity, "namespaces", query, limit] as const,
    repositories: (
      providerIdentity: string | null,
      namespace: readonly string[] | null,
      query: string | null = null,
      limit = 50,
    ) =>
      [
        "source-control",
        providerIdentity,
        "repositories",
        namespace,
        query,
        limit,
      ] as const,
    workItems: (
      providerIdentity: string | null,
      query: string | null = null,
      limit = 50,
    ) =>
      ["source-control", providerIdentity, "work-items", query, limit] as const,
    changeRequests: (
      providerIdentity: string | null,
      query: string | null = null,
      limit = 50,
    ) =>
      [
        "source-control",
        providerIdentity,
        "change-requests",
        query,
        limit,
      ] as const,
    changeRequest: (providerIdentity: string | null, id: string | null) =>
      ["source-control", providerIdentity, "change-request", id] as const,
    currentChangeRequest: (providerIdentity: string | null) =>
      [
        "source-control",
        providerIdentity,
        "change-request",
        "current",
      ] as const,
    changeRequestPreflight: (
      providerIdentity: string | null,
      sourceBranch: string | null,
      targetBranch: string | null,
    ) =>
      [
        "source-control",
        providerIdentity,
        "change-request",
        "preflight",
        sourceBranch,
        targetBranch,
      ] as const,
    changeRequestTemplate: (providerIdentity: string | null) =>
      [
        "source-control",
        providerIdentity,
        "change-request",
        "template",
      ] as const,
    checks: (providerIdentity: string | null, id: string | null) =>
      ["source-control", providerIdentity, "checks", id] as const,
    checksSummary: (providerIdentity: string | null, id: string | null) =>
      ["source-control", providerIdentity, "checks", id, "summary"] as const,
    reviewThreadsRoot: (providerIdentity: string | null) =>
      ["source-control", providerIdentity, "reviews"] as const,
    reviewThreads: (providerIdentity: string | null, id: string | null) =>
      ["source-control", providerIdentity, "reviews", id, "threads"] as const,
  },
  pathLauncher: {
    availability: () => ["path-launcher", "availability"] as const,
  },
  shepherd: {
    all: () => ["shepherd"] as const,
    session: (chatId: string | null) =>
      ["shepherd", "session", chatId] as const,
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
