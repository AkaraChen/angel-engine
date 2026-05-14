import { BrowserWindow, Menu } from "electron";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";

import type {
  ChatCreateInput,
  ChatPrewarmInput,
  ChatRenameInput,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSetModeInput,
  ChatSetPermissionModeInput,
  ChatSetRuntimeInput,
} from "../../../shared/chat";
import { normalizeChatAttachmentsInput } from "../../../shared/chat";
import {
  closeChatSession,
  createChatFromInput,
  inspectChatRuntimeConfig,
  loadChatSession,
  prewarmChat,
  sendChat,
  setChatMode,
  setChatPermissionMode,
  setChatRuntime,
} from "./angel-client";
import {
  archiveChat,
  deleteAllChats,
  deleteChat,
  getChat,
  listChats,
  renameChat,
} from "./repository";
import {
  chatCreateInput,
  chatPrewarmInput,
  chatRenameInput,
  chatRuntimeConfigInput,
  chatSendInput,
  chatSetModeInput,
  chatSetPermissionModeInput,
  chatSetRuntimeInput,
} from "./schemas";
import { translate } from "../../i18n";

const t = tipc.create();

export const chatIpcRouter = {
  chatsArchive: t.procedure.input<string>().action(async ({ input }) => {
    const value = arkType("string")(input);
    if (value instanceof arkType.errors) {
      throw new Error("Chat id is required.");
    }
    return archiveChat(value);
  }),

  chatsCreate: t.procedure
    .input<ChatCreateInput>()
    .action(async ({ input }) => {
      const value = chatCreateInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Chat input is required.");
      }

      return createChatFromInput({
        model: value.model,
        projectId: value.projectId,
        mode: value.mode,
        permissionMode: value.permissionMode,
        reasoningEffort: value.reasoningEffort,
        runtime: value.runtime ?? undefined,
        title: value.title,
      });
    }),

  chatsDeleteAll: t.procedure.action(async () => {
    closeChatSession();
    return { deletedCount: deleteAllChats() };
  }),

  chatsGet: t.procedure.input<string>().action(async ({ input }) => {
    const value = arkType("string")(input);
    if (value instanceof arkType.errors) {
      throw new Error("Chat id is required.");
    }
    return getChat(value);
  }),

  chatsList: t.procedure.action(async () => listChats()),

  chatsLoad: t.procedure.input<string>().action(async ({ input }) => {
    const value = arkType("string")(input);
    if (value instanceof arkType.errors) {
      throw new Error("Chat id is required.");
    }
    return loadChatSession(value);
  }),

  chatsPrewarm: t.procedure
    .input<ChatPrewarmInput>()
    .action(async ({ input }) => {
      const value = chatPrewarmInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Chat prewarm input is required.");
      }
      return prewarmChat({
        projectId: value.projectId,
        runtime: value.runtime ?? undefined,
      });
    }),

  chatsRename: t.procedure
    .input<ChatRenameInput>()
    .action(async ({ input }) => {
      const value = chatRenameInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Chat rename input is required.");
      }
      return renameChat(value.chatId, value.title);
    }),

  chatsRuntimeConfig: t.procedure
    .input<ChatRuntimeConfigInput>()
    .action(async ({ input }) => {
      const value = chatRuntimeConfigInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Chat runtime config input is required.");
      }
      return inspectChatRuntimeConfig({
        cwd: value.cwd,
        runtime: value.runtime ?? undefined,
      });
    }),

  chatsSetMode: t.procedure
    .input<ChatSetModeInput>()
    .action(async ({ input }) => {
      const value = chatSetModeInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Chat mode input is required.");
      }
      return setChatMode(value);
    }),

  chatsSetPermissionMode: t.procedure
    .input<ChatSetPermissionModeInput>()
    .action(async ({ input }) => {
      const value = chatSetPermissionModeInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Chat permission mode input is required.");
      }
      return setChatPermissionMode(value);
    }),

  chatsSetRuntime: t.procedure
    .input<ChatSetRuntimeInput>()
    .action(async ({ input }) => {
      const value = chatSetRuntimeInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Chat runtime input is required.");
      }
      return setChatRuntime(value);
    }),

  chatsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const chatId = arkType("string")(input);
      if (chatId instanceof arkType.errors) {
        throw new Error("Chat id is required.");
      }
      const chat = getChat(chatId);
      if (!chat) {
        throw new Error("Chat not found.");
      }

      return new Promise<"cancelled" | "deleted" | "rename">((resolve) => {
        const menu = Menu.buildFromTemplate([
          {
            click: () => resolve("rename"),
            label: translate("common.rename"),
          },
          { type: "separator" },
          {
            click: () => {
              closeChatSession(chat.id);
              deleteChat(chat.id);
              resolve("deleted");
            },
            label: translate("common.delete"),
          },
        ]);

        menu.popup({
          callback: () => resolve("cancelled"),
          window: BrowserWindow.fromWebContents(context.sender) ?? undefined,
        });
      });
    }),

  chatSend: t.procedure.input<ChatSendInput>().action(async ({ input }) => {
    const value = chatSendInput(input);
    if (value instanceof arkType.errors) {
      throw new Error("Chat input is required.");
    }
    return sendChat({
      attachments: normalizeChatAttachmentsInput(value.attachments),
      chatId: value.chatId,
      model: value.model,
      projectId: value.projectId,
      mode: value.mode,
      permissionMode: value.permissionMode,
      prewarmId: value.prewarmId,
      reasoningEffort: value.reasoningEffort,
      runtime: value.runtime ?? undefined,
      text: value.text,
    });
  }),
};
