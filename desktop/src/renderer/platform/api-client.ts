import { createDaemonApiClient } from "@angel-engine/daemon-api/client";
import { getDaemonTransport } from "@/platform/daemon-transport";
import { ipc } from "@/platform/ipc";

export function getApiClient() {
  const daemon = createDaemonApiClient({
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
  };
}

export type ApiClient = ReturnType<typeof getApiClient>;
