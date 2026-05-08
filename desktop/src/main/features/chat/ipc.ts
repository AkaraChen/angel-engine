import { BrowserWindow, Menu } from "electron";
import { tipc } from "@egoist/tipc/main";

import type {
  ChatCreateInput,
  ChatPrewarmInput,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSetModeInput,
} from "../../../shared/chat";
import {
  closeChatSession,
  inspectChatRuntimeConfig,
  loadChatSession,
  prewarmChat,
  sendChat,
  setChatMode,
} from "./angel-client";
import {
  createChat,
  deleteAllChats,
  deleteChat,
  getChat,
  listChats,
} from "./repository";
import {
  parseChatCreateInput,
  parseChatId,
  parseChatPrewarmInput,
  parseChatRuntimeConfigInput,
  parseChatSendInput,
  parseChatSetModeInput,
} from "./input-schemas";

const t = tipc.create();

export const chatIpcRouter = {
  chatsCreate: t.procedure
    .input<ChatCreateInput>()
    .action(async ({ input }) => createChat(parseChatCreateInput(input))),

  chatsDeleteAll: t.procedure.action(async () => {
    closeChatSession();
    return { deletedCount: deleteAllChats() };
  }),

  chatsGet: t.procedure
    .input<string>()
    .action(async ({ input }) => getChat(parseChatId(input))),

  chatsList: t.procedure.action(async () => listChats()),

  chatsLoad: t.procedure
    .input<string>()
    .action(async ({ input }) => loadChatSession(parseChatId(input))),

  chatsPrewarm: t.procedure
    .input<ChatPrewarmInput>()
    .action(async ({ input }) => prewarmChat(parseChatPrewarmInput(input))),

  chatsRuntimeConfig: t.procedure
    .input<ChatRuntimeConfigInput>()
    .action(async ({ input }) =>
      inspectChatRuntimeConfig(parseChatRuntimeConfigInput(input)),
    ),

  chatsSetMode: t.procedure
    .input<ChatSetModeInput>()
    .action(async ({ input }) => setChatMode(parseChatSetModeInput(input))),

  chatsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const chat = getChat(parseChatId(input));
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
    .action(async ({ input }) => sendChat(parseChatSendInput(input))),
};
