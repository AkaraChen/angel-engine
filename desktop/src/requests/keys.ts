export const queryKeys = {
  chats: {
    all: () => ['chats'] as const,
    detail: (id: string | null) => ['chats', 'detail', id] as const,
    details: () => ['chats', 'detail'] as const,
    list: () => ['chats', 'list'] as const,
  },
  projects: {
    all: () => ['projects'] as const,
    detail: (id: string | null) => ['projects', 'detail', id] as const,
    details: () => ['projects', 'detail'] as const,
    list: () => ['projects', 'list'] as const,
  },
} as const;
