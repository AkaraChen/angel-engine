import type { Chat } from "@angel-engine/daemon-api/chat";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

import { app, clipboard, Menu } from "electron";
import { daemonClient } from "../../daemon/client";
import { translate } from "../../platform/i18n";
import {
  buildChatDeleteConfirmDetail,
  buildChatDeleteConfirmMessage,
  confirmDestructiveDelete,
} from "../destructive-confirm";

export type ChatContextMenuResult =
  | "cancelled"
  | "copied"
  | "deleted"
  | "handoff"
  | "pinned"
  | "rename"
  | "unpinned";

export async function showChatContextMenu(
  chat: Chat,
  window: BrowserWindow | undefined,
): Promise<ChatContextMenuResult> {
  return new Promise((resolve, reject) => {
    let handled = false;
    const template: MenuItemConstructorOptions[] = [
      {
        click: () => {
          handled = true;
          void daemonClient.chats.setPinned(chat.id, !chat.pinned).then(
            () => resolve(chat.pinned ? "unpinned" : "pinned"),
            (error: unknown) => reject(error),
          );
        },
        label: translate(chat.pinned ? "common.unpin" : "common.pin"),
      },
      {
        click: () => {
          handled = true;
          resolve("rename");
        },
        label: translate("common.rename"),
      },
      {
        click: () => {
          handled = true;
          resolve("handoff");
        },
        label: translate("messages.handoff"),
      },
    ];
    if (!app.isPackaged) {
      template.push(
        { type: "separator" },
        {
          click: () => {
            clipboard.writeText(JSON.stringify(chat, null, 2));
            handled = true;
            resolve("copied");
          },
          label: "Copy chat entity as JSON",
        },
      );
    }
    const menu = Menu.buildFromTemplate([
      ...template,
      { type: "separator" },
      {
        click: () => {
          handled = true;
          void confirmAndDeleteChat(chat, window).then(resolve, reject);
        },
        label: translate("common.delete"),
      },
    ]);
    menu.popup({
      callback: () => {
        if (!handled) resolve("cancelled");
      },
      window,
    });
  });
}

async function confirmAndDeleteChat(
  chat: Chat,
  window: BrowserWindow | undefined,
): Promise<"cancelled" | "deleted"> {
  const confirmed = await confirmDestructiveDelete(
    {
      detail: buildChatDeleteConfirmDetail(),
      message: buildChatDeleteConfirmMessage(chat.title),
    },
    window,
  );
  if (!confirmed) return "cancelled";
  await daemonClient.chats.delete(chat.id);
  return "deleted";
}
