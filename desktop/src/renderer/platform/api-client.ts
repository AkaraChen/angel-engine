import { createDaemonClient } from "@angel-engine/daemon-client";
import type { PathLauncherTargetRef } from "@shared/path-launcher";
import { getDaemonTransport } from "@/platform/daemon-transport";
import { ipc } from "@/platform/ipc";

export function getApiClient() {
  const daemon = createDaemonClient({
    baseUrl: "",
    fetch: async (pathname, init) => getDaemonTransport().fetch(pathname, init),
  });
  return {
    ...daemon,
    chats: {
      ...daemon.chats,
      showContextMenu: async (chatId: string) =>
        ipc.chatsShowContextMenu(chatId),
    },
    projects: {
      ...daemon.projects,
      chooseDirectory: async () => ipc.projectsChooseDirectory(),
      showContextMenu: async (projectId: string) =>
        ipc.projectsShowContextMenu(projectId),
    },
    pathLauncher: {
      showContextMenu: async (ref: PathLauncherTargetRef) =>
        ipc.pathLauncherShowContextMenu(ref),
    },
  };
}

export type ApiClient = ReturnType<typeof getApiClient>;
