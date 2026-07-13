export const workspaceProcessQueryKeys = {
  all: () => ["workspace-processes"] as const,
  registry: () => ["workspace-processes", "registry"] as const,
};
