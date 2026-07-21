import type { MenuItemConstructorOptions } from "electron";

import { DaemonRequestError } from "@angel-engine/daemon-client";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { Effect } from "effect";
import { app, BrowserWindow, clipboard, Menu } from "electron";
import { daemonClient } from "../../daemon/client";
import { MainIpcError } from "../../platform/errors";
import { translate } from "../../platform/i18n";

const t = tipc.create();

export const chatPlatformIpcRouter = {
  chatsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const chatId = arkType("string")(input);
          if (chatId instanceof arkType.errors) {
            return yield* Effect.fail(
              MainIpcError.invalidRequest("Chat id is required."),
            );
          }
          const chat = yield* Effect.tryPromise({
            catch: (cause) =>
              cause instanceof DaemonRequestError
                ? MainIpcError.daemonRequestFailed(cause.message)
                : MainIpcError.operationFailed(cause),
            try: () => daemonClient.chats.get(chatId),
          });
          if (chat === null) {
            return yield* Effect.fail(MainIpcError.notFound("Chat not found."));
          }
          return yield* Effect.promise(
            () =>
              new Promise<
                | "cancelled"
                | "copied"
                | "deleted"
                | "pinned"
                | "rename"
                | "unpinned"
              >((resolve) => {
                let handled = false;
                const template: MenuItemConstructorOptions[] = [
                  {
                    click: () => {
                      handled = true;
                      void daemonClient.chats
                        .setPinned(chat.id, !chat.pinned)
                        .then(() =>
                          resolve(chat.pinned ? "unpinned" : "pinned"),
                        );
                    },
                    label: translate(
                      chat.pinned ? "common.unpin" : "common.pin",
                    ),
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
                      void daemonClient.chats
                        .delete(chat.id)
                        .then(() => resolve("deleted"));
                    },
                    label: translate("common.delete"),
                  },
                ]);
                menu.popup({
                  callback: () => {
                    if (!handled) resolve("cancelled");
                  },
                  window:
                    BrowserWindow.fromWebContents(context.sender) ?? undefined,
                });
              }),
          );
        }),
      ),
    ),
};
