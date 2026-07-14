export const queryKeys = {
  daemon: {
    health: ["daemon", "health"] as const,
    processes: ["daemon", "processes"] as const,
  },
  chats: {
    list: ["chats", "list"] as const,
    detail: (chatId: string) => ["chats", "detail", chatId] as const,
    load: (chatId: string) => ["chats", "load", chatId] as const,
    runtimeConfig: (runtime: string, cwd?: string) =>
      ["chats", "runtime-config", runtime, cwd ?? null] as const,
  },
  projects: {
    list: ["projects", "list"] as const,
  },
  agents: {
    list: ["agents", "list"] as const,
  },
} as const;
