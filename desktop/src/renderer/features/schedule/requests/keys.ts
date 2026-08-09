export const scheduleQueryKeys = {
  automations: {
    all: () => ["schedule", "automations"] as const,
    list: () => ["schedule", "automations", "list"] as const,
  },
} as const;
