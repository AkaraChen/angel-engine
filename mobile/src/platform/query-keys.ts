export const queryKeys = {
  daemon: {
    health: ["daemon", "health"] as const,
    processes: ["daemon", "processes"] as const,
  },
  chats: {
    all: ["chats"] as const,
    list: ["chats", "list"] as const,
    detail: (chatId: string) => ["chats", "detail", chatId] as const,
    load: (chatId: string) => ["chats", "load", chatId] as const,
    runtimeConfig: (runtime: string, cwd?: string) =>
      ["chats", "runtime-config", runtime, cwd ?? null] as const,
  },
  projects: {
    all: ["projects"] as const,
    list: ["projects", "list"] as const,
    deleteImpact: (projectId: string | null) =>
      ["projects", "delete-impact", projectId] as const,
  },
  agents: {
    all: ["agents"] as const,
    list: ["agents", "list"] as const,
    customList: ["agents", "custom", "list"] as const,
    customDeleteImpact: (agentId: string | null) =>
      ["agents", "custom", "delete-impact", agentId] as const,
  },
  workspace: {
    gitDiff: (root: string) => ["workspace", "git-diff", root] as const,
  },
} as const;
