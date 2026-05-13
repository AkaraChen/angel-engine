import { ipc } from "@/platform/ipc";
import type {
  ChatCreateInput,
  ChatPrewarmInput,
  ProjectFileSearchInput,
  ChatRenameInput,
  ChatRuntimeConfigInput,
  ChatSetModeInput,
} from "@/shared/chat";
import type { CreateProjectInput } from "@/shared/projects";

type ChatApiClient = {
  create: (input?: ChatCreateInput) => ReturnType<typeof ipc.chatsCreate>;
  deleteAll: () => ReturnType<typeof ipc.chatsDeleteAll>;
  inspectConfig: (
    input?: ChatRuntimeConfigInput,
  ) => ReturnType<typeof ipc.chatsRuntimeConfig>;
  list: () => ReturnType<typeof ipc.chatsList>;
  load: (chatId: string) => ReturnType<typeof ipc.chatsLoad>;
  prewarm: (input?: ChatPrewarmInput) => ReturnType<typeof ipc.chatsPrewarm>;
  rename: (input: ChatRenameInput) => ReturnType<typeof ipc.chatsRename>;
  setMode: (input: ChatSetModeInput) => ReturnType<typeof ipc.chatsSetMode>;
  showContextMenu: (
    chatId: string,
  ) => ReturnType<typeof ipc.chatsShowContextMenu>;
};

type ProjectsApiClient = {
  chooseDirectory: () => ReturnType<typeof ipc.projectsChooseDirectory>;
  create: (input: CreateProjectInput) => ReturnType<typeof ipc.projectsCreate>;
  list: () => ReturnType<typeof ipc.projectsList>;
  searchFiles: (
    input: ProjectFileSearchInput,
  ) => ReturnType<typeof ipc.projectsSearchFiles>;
  showContextMenu: (
    projectId: string,
  ) => ReturnType<typeof ipc.projectsShowContextMenu>;
};

export type ApiClient = {
  chats: ChatApiClient;
  projects: ProjectsApiClient;
};

export function createApiClient(): ApiClient {
  return {
    chats: {
      create: (input: ChatCreateInput = {}) => ipc.chatsCreate(input),
      deleteAll: () => ipc.chatsDeleteAll(),
      inspectConfig: (input: ChatRuntimeConfigInput = {}) =>
        ipc.chatsRuntimeConfig(input),
      list: () => ipc.chatsList(),
      load: (chatId: string) => ipc.chatsLoad(chatId),
      prewarm: (input: ChatPrewarmInput = {}) => ipc.chatsPrewarm(input),
      rename: (input: ChatRenameInput) => ipc.chatsRename(input),
      setMode: (input: ChatSetModeInput) => ipc.chatsSetMode(input),
      showContextMenu: (chatId: string) => ipc.chatsShowContextMenu(chatId),
    },
    projects: {
      chooseDirectory: () => ipc.projectsChooseDirectory(),
      create: (input: CreateProjectInput) => ipc.projectsCreate(input),
      list: () => ipc.projectsList(),
      searchFiles: (input: ProjectFileSearchInput) =>
        ipc.projectsSearchFiles(input),
      showContextMenu: (projectId: string) =>
        ipc.projectsShowContextMenu(projectId),
    },
  };
}

let apiClient: ApiClient | undefined;

export function getApiClient(): ApiClient {
  apiClient ??= createApiClient();
  return apiClient;
}
