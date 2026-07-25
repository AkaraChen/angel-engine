import type { PathLauncherTargetRef } from "@shared/path-launcher";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { Effect } from "effect";
import { BrowserWindow } from "electron";
import { MainIpcError } from "../../platform/errors";
import { showPathLauncherContextMenu } from "./context-menu";

const t = tipc.create();
const targetRefSchema = arkType({
  "chatId?": "string > 0",
  projectId: "string > 0",
});

export const pathLauncherPlatformIpcRouter = {
  pathLauncherShowContextMenu: t.procedure
    .input<PathLauncherTargetRef>()
    .action(async ({ context, input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const ref = targetRefSchema(input);
          if (ref instanceof arkType.errors) {
            return yield* Effect.fail(
              MainIpcError.invalidRequest(
                "A project id and optional chat id are required.",
              ),
            );
          }
          return yield* Effect.tryPromise({
            catch: (cause) => MainIpcError.operationFailed(cause),
            try: () =>
              showPathLauncherContextMenu(
                ref,
                BrowserWindow.fromWebContents(context.sender) ?? undefined,
              ),
          });
        }),
      ),
    ),
};
