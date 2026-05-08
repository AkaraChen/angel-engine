import { BrowserWindow, dialog, Menu, shell } from "electron";
import { tipc } from "@egoist/tipc/main";

import type {
  ChatCreateInput,
  ChatPrewarmInput,
  ProjectFileSearchInput,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSetModeInput,
} from "../shared/chat";
import { normalizeChatAttachmentsInput } from "../shared/chat";
import { normalizeAgentRuntime } from "../shared/agents";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../shared/projects";
import {
  closeChatSession,
  inspectChatRuntimeConfig,
  loadChatSession,
  prewarmChat,
  sendChat,
  setChatMode,
} from "./chat/angel-client";
import {
  createChat,
  deleteAllChats,
  deleteChat,
  getChat,
  listChats,
} from "./chat/repository";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./projects/repository";
import { searchProjectFiles } from "./projects/file-search";

const t = tipc.create();

export const appRouter = {
  chatsCreate: t.procedure
    .input<ChatCreateInput>()
    .action(async ({ input }) => createChat(assertChatCreateInput(input))),

  chatsGet: t.procedure
    .input<string>()
    .action(async ({ input }) =>
      getChat(assertString(input, "Chat id is required.")),
    ),

  chatsList: t.procedure.action(async () => listChats()),

  chatsRuntimeConfig: t.procedure
    .input<ChatRuntimeConfigInput>()
    .action(async ({ input }) =>
      inspectChatRuntimeConfig(assertChatRuntimeConfigInput(input)),
    ),

  chatsPrewarm: t.procedure
    .input<ChatPrewarmInput>()
    .action(async ({ input }) => prewarmChat(assertChatPrewarmInput(input))),

  chatsSetMode: t.procedure
    .input<ChatSetModeInput>()
    .action(async ({ input }) => setChatMode(assertChatSetModeInput(input))),

  chatsLoad: t.procedure
    .input<string>()
    .action(async ({ input }) =>
      loadChatSession(assertString(input, "Chat id is required.")),
    ),

  chatsDeleteAll: t.procedure.action(async () => {
    closeChatSession();
    return { deletedCount: deleteAllChats() };
  }),

  chatsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const chat = getChat(assertString(input, "Chat id is required."));
      if (!chat) {
        throw new Error("Chat not found.");
      }

      return new Promise<"cancelled" | "deleted">((resolve) => {
        const menu = Menu.buildFromTemplate([
          {
            click: () => {
              closeChatSession(chat.id);
              deleteChat(chat.id);
              resolve("deleted");
            },
            label: "Delete",
          },
        ]);

        menu.popup({
          callback: () => resolve("cancelled"),
          window: BrowserWindow.fromWebContents(context.sender) ?? undefined,
        });
      });
    }),

  chatSend: t.procedure
    .input<ChatSendInput>()
    .action(async ({ input }) => sendChat(assertChatSendInput(input))),

  projectsChooseDirectory: t.procedure.action(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Choose project folder",
    });

    return result.canceled ? null : result.filePaths[0];
  }),

  projectsCreate: t.procedure
    .input<CreateProjectInput>()
    .action(async ({ input }) => createProject(assertCreateInput(input))),

  projectsDelete: t.procedure
    .input<string>()
    .action(async ({ input }) =>
      deleteProject(assertString(input, "Project id is required.")),
    ),

  projectsGet: t.procedure
    .input<string>()
    .action(async ({ input }) =>
      getProject(assertString(input, "Project id is required.")),
    ),

  projectsList: t.procedure.action(async () => listProjects()),

  projectsSearchFiles: t.procedure
    .input<ProjectFileSearchInput>()
    .action(async ({ input }) =>
      searchProjectFiles(assertProjectFileSearchInput(input)),
    ),

  projectsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const project = getProject(
        assertString(input, "Project id is required."),
      );
      if (!project) {
        throw new Error("Project not found.");
      }

      return new Promise<"cancelled" | "deleted" | "opened">((resolve) => {
        const menu = Menu.buildFromTemplate([
          {
            click: async () => {
              await shell.openPath(project.path);
              resolve("opened");
            },
            label: "Open in Finder",
          },
          { type: "separator" },
          {
            click: () => {
              deleteProject(project.id);
              resolve("deleted");
            },
            label: "Delete",
          },
        ]);

        menu.popup({
          callback: () => resolve("cancelled"),
          window: BrowserWindow.fromWebContents(context.sender) ?? undefined,
        });
      });
    }),

  projectsUpdate: t.procedure
    .input<UpdateProjectInput>()
    .action(async ({ input }) => updateProject(assertUpdateInput(input))),
};

export type AppRouter = typeof appRouter;

function assertChatSendInput(input: ChatSendInput): ChatSendInput {
  if (!input || typeof input !== "object") {
    throw new Error("Chat input is required.");
  }

  return {
    attachments: normalizeChatAttachmentsInput(input.attachments),
    chatId:
      typeof input.chatId === "string" && input.chatId.trim()
        ? input.chatId.trim()
        : undefined,
    cwd:
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : undefined,
    model: normalizeOptionalConfigInput(input.model),
    projectId:
      typeof input.projectId === "string" && input.projectId.trim()
        ? input.projectId.trim()
        : null,
    mode: normalizeOptionalConfigInput(input.mode),
    prewarmId:
      typeof input.prewarmId === "string" && input.prewarmId.trim()
        ? input.prewarmId.trim()
        : undefined,
    reasoningEffort: normalizeOptionalConfigInput(input.reasoningEffort),
    runtime: normalizeOptionalRuntime(input.runtime),
    text: assertString(input.text, "Chat text is required."),
  };
}

function assertProjectFileSearchInput(
  input: ProjectFileSearchInput,
): ProjectFileSearchInput {
  if (!input || typeof input !== "object") {
    throw new Error("Project file search input is required.");
  }
  return {
    limit:
      typeof input.limit === "number" && Number.isFinite(input.limit)
        ? input.limit
        : undefined,
    query: typeof input.query === "string" ? input.query : undefined,
    root: assertString(input.root, "Project path is required."),
  };
}

function assertChatCreateInput(input: ChatCreateInput): ChatCreateInput {
  if (!input || typeof input !== "object") {
    return {};
  }

  return {
    cwd:
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : undefined,
    model: normalizeOptionalConfigInput(input.model),
    projectId:
      typeof input.projectId === "string" && input.projectId.trim()
        ? input.projectId.trim()
        : null,
    mode: normalizeOptionalConfigInput(input.mode),
    reasoningEffort: normalizeOptionalConfigInput(input.reasoningEffort),
    runtime: normalizeOptionalRuntime(input.runtime),
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : undefined,
  };
}

function assertChatPrewarmInput(input: ChatPrewarmInput): ChatPrewarmInput {
  if (!input || typeof input !== "object") {
    return {};
  }

  return {
    cwd:
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : undefined,
    projectId:
      typeof input.projectId === "string" && input.projectId.trim()
        ? input.projectId.trim()
        : null,
    runtime: normalizeOptionalRuntime(input.runtime),
  };
}

function assertChatRuntimeConfigInput(
  input: ChatRuntimeConfigInput,
): ChatRuntimeConfigInput {
  if (!input || typeof input !== "object") {
    return {};
  }

  return {
    cwd:
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : undefined,
    runtime: normalizeOptionalRuntime(input.runtime),
  };
}

function assertChatSetModeInput(input: ChatSetModeInput): ChatSetModeInput {
  if (!input || typeof input !== "object") {
    throw new Error("Chat mode input is required.");
  }

  const mode = normalizeOptionalConfigInput(input.mode);
  if (!mode) {
    throw new Error("Chat mode is required.");
  }

  return {
    chatId: assertString(input.chatId, "Chat id is required.").trim(),
    cwd:
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : undefined,
    mode,
  };
}

function assertCreateInput(input: CreateProjectInput): CreateProjectInput {
  if (!input || typeof input !== "object") {
    throw new Error("Project input is required.");
  }

  return {
    id: typeof input.id === "string" ? input.id : undefined,
    path: assertString(input.path, "Project path is required."),
  };
}

function assertUpdateInput(input: UpdateProjectInput): UpdateProjectInput {
  if (!input || typeof input !== "object") {
    throw new Error("Project input is required.");
  }

  return {
    id: assertString(input.id, "Project id is required."),
    path: assertString(input.path, "Project path is required."),
  };
}

function assertString(value: unknown, message: string) {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  return value;
}

function normalizeOptionalRuntime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return normalizeAgentRuntime(value);
}

function normalizeOptionalConfigInput(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
