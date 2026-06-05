import type { MenuItemConstructorOptions } from "electron";
import type {
  Chat,
  ChatArchivedDeleteImpact,
  ChatArchivedDeleteInput,
  ChatArchivedDeleteResult,
  ChatArchivedRestoreInput,
  ChatCreateInput,
  ChatIdsInput,
  ChatPrewarmInput,
  ChatRenameInput,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSetModeInput,
  ChatSetPermissionModeInput,
  ChatSetRuntimeInput,
} from "../../../shared/chat";
import type { ChatRuntime } from "./runtime";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import { app, BrowserWindow, clipboard, Menu } from "electron";
import { normalizeChatAttachmentsInput } from "../../../shared/chat";
import { translate } from "../../platform/i18n";
import {
  archiveChat,
  deleteArchivedChats,
  deleteAllChats,
  deleteChat,
  getChat,
  listArchivedChats,
  listChats,
  renameChat,
  requireArchivedChat,
  restoreArchivedChats,
} from "./repository";
import {
  chatCreateInput,
  chatIdsInput,
  chatPrewarmInput,
  chatRenameInput,
  chatRuntimeConfigInput,
  chatSendInput,
  chatSetModeInput,
  chatSetPermissionModeInput,
  chatSetRuntimeInput,
} from "./schemas";
import { managedWorktreePath, removeManagedWorktree } from "../projects/git";

const t = tipc.create();

export function createChatIpcRouter(runtime: ChatRuntime) {
  return {
    chatsArchive: t.procedure.input<string>().action(async ({ input }) => {
      const value = arkType("string")(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Chat id is required.");
      }
      return archiveChat(value);
    }),

    chatsArchivedDelete: t.procedure
      .input<ChatArchivedDeleteInput>()
      .action(async ({ input }) => {
        const chatIds = readChatIdsInput(input);
        const targetChats = chatIds.map((chatId) =>
          requireArchivedChat(chatId),
        );
        const deletedWorktrees =
          await removeManagedWorktreesForChats(targetChats);

        for (const chat of targetChats) {
          runtime.closeChatSession(chat.id);
        }
        const deletedChats = deleteArchivedChats(chatIds);

        return {
          deletedCount: deletedChats.length,
          deletedWorktreeCount: deletedWorktrees.length,
          deletedWorktrees,
        } satisfies ChatArchivedDeleteResult;
      }),

    chatsArchivedDeleteImpact: t.procedure
      .input<ChatIdsInput>()
      .action(async ({ input }) => {
        const targetChats = readChatIdsInput(input).map((chatId) =>
          requireArchivedChat(chatId),
        );
        const managedWorktrees = managedWorktreesForChats(targetChats);

        return {
          chatCount: targetChats.length,
          managedWorktreeCount: managedWorktrees.length,
          managedWorktrees,
        } satisfies ChatArchivedDeleteImpact;
      }),

    chatsArchivedList: t.procedure.action(async () => listArchivedChats()),

    chatsArchivedRestore: t.procedure
      .input<ChatArchivedRestoreInput>()
      .action(async ({ input }) =>
        restoreArchivedChats(readChatIdsInput(input)),
      ),

    chatsCreate: t.procedure
      .input<ChatCreateInput>()
      .action(async ({ input }) => {
        const value = chatCreateInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Chat input is required.");
        }

        return runtime.createChatFromInput({
          creationLocation: value.creationLocation,
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
      runtime.closeChatSession();
      return { deletedCount: deleteAllChats() };
    }),

    chatsGet: t.procedure.input<string>().action(async ({ input }) => {
      const value = arkType("string")(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Chat id is required.");
      }
      return getChat(value);
    }),

    chatsList: t.procedure.action(async () => listChats()),

    chatsLoad: t.procedure.input<string>().action(async ({ input }) => {
      const value = arkType("string")(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Chat id is required.");
      }
      return runtime.loadChatSession(value);
    }),

    chatsPrewarm: t.procedure
      .input<ChatPrewarmInput>()
      .action(async ({ input }) => {
        const value = chatPrewarmInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Chat prewarm input is required.");
        }
        return runtime.prewarmChat({
          creationLocation: value.creationLocation,
          projectId: value.projectId,
          runtime: value.runtime ?? undefined,
        });
      }),

    chatsRename: t.procedure
      .input<ChatRenameInput>()
      .action(async ({ input }) => {
        const value = chatRenameInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Chat rename input is required.");
        }
        return renameChat(value.chatId, value.title);
      }),

    chatsRuntimeConfig: t.procedure
      .input<ChatRuntimeConfigInput>()
      .action(async ({ input }) => {
        const value = chatRuntimeConfigInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Chat runtime config input is required.");
        }
        return runtime.inspectChatRuntimeConfig({
          cwd: value.cwd,
          runtime: value.runtime ?? undefined,
        });
      }),

    chatsSetMode: t.procedure
      .input<ChatSetModeInput>()
      .action(async ({ input }) => {
        const value = chatSetModeInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Chat mode input is required.");
        }
        return runtime.setChatMode(value);
      }),

    chatsSetPermissionMode: t.procedure
      .input<ChatSetPermissionModeInput>()
      .action(async ({ input }) => {
        const value = chatSetPermissionModeInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Chat permission mode input is required.");
        }
        return runtime.setChatPermissionMode(value);
      }),

    chatsSetRuntime: t.procedure
      .input<ChatSetRuntimeInput>()
      .action(async ({ input }) => {
        const value = chatSetRuntimeInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Chat runtime input is required.");
        }
        return runtime.setChatRuntime(value);
      }),

    chatsShowContextMenu: t.procedure
      .input<string>()
      .action(async ({ context, input }) => {
        const chatId = arkType("string")(input);
        if (chatId instanceof arkType.errors) {
          throw new TypeError("Chat id is required.");
        }
        const chat = getChat(chatId);
        if (!chat) {
          throw new Error("Chat not found.");
        }

        return new Promise<"cancelled" | "copied" | "deleted" | "rename">(
          (resolve) => {
            const menuTemplate: MenuItemConstructorOptions[] = [
              {
                click: () => resolve("rename"),
                label: translate("common.rename"),
              },
            ];

            if (!app.isPackaged) {
              menuTemplate.push(
                { type: "separator" },
                {
                  click: () => {
                    clipboard.writeText(JSON.stringify(chat, null, 2));
                    resolve("copied");
                  },
                  label: "Copy chat entity as JSON",
                },
              );
            }

            const menu = Menu.buildFromTemplate([
              ...menuTemplate,
              { type: "separator" },
              {
                click: () => {
                  runtime.closeChatSession(chat.id);
                  deleteChat(chat.id);
                  resolve("deleted");
                },
                label: translate("common.delete"),
              },
            ]);

            menu.popup({
              callback: () => resolve("cancelled"),
              window:
                BrowserWindow.fromWebContents(context.sender) ?? undefined,
            });
          },
        );
      }),

    chatSend: t.procedure.input<ChatSendInput>().action(async ({ input }) => {
      const value = chatSendInput(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Chat input is required.");
      }
      return runtime.sendChat({
        attachments: normalizeChatAttachmentsInput(value.attachments),
        chatId: value.chatId,
        creationLocation: value.creationLocation,
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
}

function readChatIdsInput(input: ChatIdsInput) {
  const value = chatIdsInput(input);
  if (value instanceof arkType.errors) {
    throw new TypeError("Chat ids are required.");
  }

  const chatIds = [...new Set(value.chatIds)];
  if (chatIds.length === 0) {
    throw new TypeError("At least one chat id is required.");
  }
  return chatIds;
}

function managedWorktreesForChats(targetChats: Chat[]) {
  return [
    ...new Set(
      targetChats
        .map((chat) => managedWorktreePath(chat.cwd))
        .filter((cwd): cwd is string => cwd !== undefined),
    ),
  ];
}

async function removeManagedWorktreesForChats(targetChats: Chat[]) {
  const removedWorktrees: string[] = [];

  for (const worktreePath of managedWorktreesForChats(targetChats)) {
    const removedPath = await removeManagedWorktree(worktreePath);
    if (removedPath) {
      removedWorktrees.push(removedPath);
    }
  }

  return removedWorktrees;
}
