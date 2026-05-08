import { ipc } from "@/lib/ipc";
import type {
  ChatCreateInput,
  ChatPrewarmInput,
  ChatRuntimeConfigInput,
  ChatSetModeInput,
} from "@/shared/chat";
import type { CreateProjectInput } from "@/shared/projects";

export function createApiClient() {
  return {
    chats: {
      create: (input: ChatCreateInput = {}) => ipc.chatsCreate(input),
      deleteAll: () => ipc.chatsDeleteAll(),
      inspectConfig: (input: ChatRuntimeConfigInput = {}) =>
        ipc.chatsRuntimeConfig(input),
      list: () => ipc.chatsList(),
      load: (chatId: string) => ipc.chatsLoad(chatId),
      prewarm: (input: ChatPrewarmInput = {}) => ipc.chatsPrewarm(input),
      setMode: (input: ChatSetModeInput) => ipc.chatsSetMode(input),
      showContextMenu: (chatId: string) => ipc.chatsShowContextMenu(chatId),
    },
    projects: {
      chooseDirectory: () => ipc.projectsChooseDirectory(),
      create: (input: CreateProjectInput) => ipc.projectsCreate(input),
      list: () => ipc.projectsList(),
      showContextMenu: (projectId: string) =>
        ipc.projectsShowContextMenu(projectId),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

let apiClient: ApiClient | undefined;

export function getApiClient() {
  apiClient ??= createApiClient();
  return apiClient;
}
