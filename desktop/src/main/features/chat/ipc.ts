import type { Chat } from "@angel-engine/daemon-api/chat";
import type { MenuItemConstructorOptions } from "electron";

import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { app, BrowserWindow, clipboard, Menu } from "electron";
import { daemonJson, jsonRequest } from "../../daemon/client";
import { translate } from "../../platform/i18n";

const t = tipc.create();

export const chatPlatformIpcRouter = {
  chatsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const chatId = arkType("string")(input);
      if (chatId instanceof arkType.errors)
        throw new TypeError("Chat id is required.");
      const chat = await daemonJson<Chat | null>(
        `/api/chats/${encodeURIComponent(chatId)}`,
      );
      if (chat === null) throw new Error("Chat not found.");
      return new Promise<
        "cancelled" | "copied" | "deleted" | "pinned" | "rename" | "unpinned"
      >((resolve) => {
        let handled = false;
        const template: MenuItemConstructorOptions[] = [
          {
            click: () => {
              handled = true;
              void daemonJson(
                `/api/chats/${encodeURIComponent(chat.id)}`,
                jsonRequest("PATCH", { pinned: !chat.pinned }),
              ).then(() => resolve(chat.pinned ? "unpinned" : "pinned"));
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
        ];
        if (!app.isPackaged)
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
        const menu = Menu.buildFromTemplate([
          ...template,
          { type: "separator" },
          {
            click: () => {
              handled = true;
              void daemonJson(`/api/chats/${encodeURIComponent(chat.id)}`, {
                method: "DELETE",
              }).then(() => resolve("deleted"));
            },
            label: translate("common.delete"),
          },
        ]);
        menu.popup({
          callback: () => {
            if (!handled) resolve("cancelled");
          },
          window: BrowserWindow.fromWebContents(context.sender) ?? undefined,
        });
      });
    }),
};
