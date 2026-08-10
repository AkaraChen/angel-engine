import type { PathLauncherInvokeRequest } from "@shared/path-launcher";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { Effect } from "effect";
import {
  PATH_LAUNCHER_EDITOR_IDS,
  pathLauncherEditorActionId,
} from "@shared/path-launcher";
import { MainIpcError } from "../../platform/errors";
import {
  invokePathLauncherAction,
  pathLauncherAvailabilitySnapshot,
} from "./actions";

const t = tipc.create();
const actionSchema = arkType.enumerated(
  ...PATH_LAUNCHER_EDITOR_IDS.map(pathLauncherEditorActionId),
  "angelTerminal",
  "copyPath",
  "fileManager",
  "systemTerminal",
);
const invokeRequestSchema = arkType({
  action: actionSchema,
  target: {
    "chatId?": "string > 0",
    projectId: "string > 0",
  },
});

export const pathLauncherPlatformIpcRouter = {
  pathLauncherAvailability: t.procedure.action(async () =>
    Effect.runPromise(
      Effect.tryPromise({
        catch: (cause) => MainIpcError.operationFailed(cause),
        try: () => pathLauncherAvailabilitySnapshot(),
      }),
    ),
  ),
  pathLauncherInvoke: t.procedure
    .input<PathLauncherInvokeRequest>()
    .action(async ({ input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const request = invokeRequestSchema(input);
          if (request instanceof arkType.errors) {
            return yield* Effect.fail(
              MainIpcError.invalidRequest(
                "A path launcher action and project id are required.",
              ),
            );
          }
          return yield* Effect.tryPromise({
            catch: (cause) => MainIpcError.operationFailed(cause),
            try: () => invokePathLauncherAction(request.target, request.action),
          });
        }),
      ),
    ),
};
