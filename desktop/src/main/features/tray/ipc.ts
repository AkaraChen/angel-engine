import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { Effect } from "effect";
import { MainIpcError } from "../../platform/errors";
import { getTrayPreferences, setTrayEnabled } from "./service";

const t = tipc.create();

export const trayPlatformIpcRouter = {
  trayGetPreferences: t.procedure.action(async () =>
    Effect.runPromise(Effect.sync(() => getTrayPreferences())),
  ),
  traySetEnabled: t.procedure
    .input<{ enabled: boolean }>()
    .action(async ({ input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const value = arkType({ enabled: "boolean" })(input);
          if (value instanceof arkType.errors) {
            return yield* Effect.fail(
              MainIpcError.invalidRequest("Tray enabled flag is required."),
            );
          }
          return setTrayEnabled(value.enabled);
        }),
      ),
    ),
};
