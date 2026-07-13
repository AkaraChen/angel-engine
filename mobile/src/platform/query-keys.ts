export const queryKeys = {
  daemon: {
    health: ["daemon", "health"] as const,
    processes: ["daemon", "processes"] as const,
  },
  chats: {
    list: ["chats", "list"] as const,
    detail: (chatId: string) => ["chats", "detail", chatId] as const,
  },
  projects: {
    list: ["projects", "list"] as const,
    worktrees: (projectId: string) =>
      ["projects", "worktrees", projectId] as const,
  },
} as const;
