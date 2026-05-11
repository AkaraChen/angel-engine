import { BrowserWindow, Menu } from "electron";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";

import type {
  ChatCreateInput,
  ChatPrewarmInput,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSetModeInput,
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
} from "./angel-client";
import { deleteAllChats, deleteChat, getChat, listChats } from "./repository";
import {
  chatCreateInput,
  chatPrewarmInput,
  chatRuntimeConfigInput,
  chatSendInput,
  chatSetModeInput,
} from "./schemas";

const t = tipc.create();

export const chatIpcRouter = {
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
      prewarmId: value.prewarmId,
      reasoningEffort: value.reasoningEffort,
      runtime: value.runtime ?? undefined,
      text: value.text,
    });
  }),
};
