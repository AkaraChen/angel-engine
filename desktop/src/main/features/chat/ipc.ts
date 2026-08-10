import { DaemonRequestError } from "@angel-engine/daemon-client";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { Effect } from "effect";
import { BrowserWindow } from "electron";
import { daemonClient } from "../../daemon/client";
import { MainIpcError } from "../../platform/errors";
import { showChatContextMenu } from "./context-menu";

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
          return yield* Effect.tryPromise({
            catch: (cause) =>
              cause instanceof DaemonRequestError
                ? MainIpcError.daemonRequestFailed(cause.message)
                : MainIpcError.operationFailed(cause),
            try: () =>
              showChatContextMenu(
                chat,
                BrowserWindow.fromWebContents(context.sender) ?? undefined,
              ),
          });
        }),
      ),
    ),
};
