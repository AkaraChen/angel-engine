export const queryKeys = {
  daemon: {
    health: ["daemon", "health"] as const,
    processes: ["daemon", "processes"] as const,
  },
  chats: {
    list: ["chats", "list"] as const,
    detail: (chatId: string) => ["chats", "detail", chatId] as const,
  },
} as const;
