import type { TipcChannel } from "../../shared/ipc-channels";
import type { MobileHostingUpdate } from "../../shared/mobile-hosting";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import { Effect } from "effect";
import {
  getMobileHostingState,
  setMobileHostingConfig,
  fetchDaemonInternal,
} from "../daemon/supervisor";
import { listMobileHostingListenAddresses } from "../daemon/mobile-hosting";
import { keybindingsPlatformIpcRouter } from "../features/keybindings/ipc";
import { pathLauncherPlatformIpcRouter } from "../features/path-launcher/ipc";
import { projectPlatformIpcRouter } from "../features/projects/ipc";
import { usagePlatformIpcRouter } from "../features/usage/ipc";
import { trayPlatformIpcRouter } from "../features/tray/ipc";
import { MainIpcError } from "../platform/errors";
import { rebuildApplicationMenu } from "../platform/application-menu";
import { setMainLanguage } from "../platform/i18n";
import { refreshSettingsWindowTitle } from "../windows/settings-window";
import { scheduleTrayRefresh } from "../features/tray/service";
import { readClipboardSourceUrl } from "./clipboard-source";
import { fetchUrlPreview } from "./url-preview";
import {
  clearLinearToken,
  hasLinearToken,
  setLinearToken,
} from "../features/secrets/linear-token";

const t = tipc.create();

const appIpcRouter = {
  appLinearTokenClear: t.procedure.action(async () =>
    Effect.runPromise(
      Effect.tryPromise({
        catch: (cause) => MainIpcError.operationFailed(cause),
        try: () => clearLinearToken(fetchDaemonInternal),
      }),
    ),
  ),
  appLinearTokenHas: t.procedure.action(async () =>
    Effect.runPromise(Effect.sync(() => ({ hasToken: hasLinearToken() }))),
  ),
  appLinearTokenSet: t.procedure
    .input<{ token: string }>()
    .action(async ({ input }) =>
      Effect.runPromise(
        Effect.tryPromise({
          catch: (cause) => MainIpcError.operationFailed(cause),
          try: () => setLinearToken(input.token, fetchDaemonInternal),
        }),
      ),
    ),
  appFetchUrlPreview: t.procedure
    .input<{ url: string }>()
    .action(async ({ input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const value = arkType({ url: "string" })(input);
          if (value instanceof arkType.errors) {
            return yield* Effect.fail(
              MainIpcError.invalidRequest("Preview URL is required."),
            );
          }
          const url = yield* Effect.try({
            catch: () =>
              MainIpcError.invalidRequest("Preview URL is not a valid URL."),
            try: () => new URL(value.url),
          });
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            return yield* Effect.fail(
              MainIpcError.invalidRequest("Preview URL must be http(s)."),
            );
          }
          return yield* Effect.tryPromise({
            catch: (cause) => MainIpcError.operationFailed(cause),
            try: () => fetchUrlPreview(url),
          });
        }),
      ),
    ),
  appReadClipboardSourceUrl: t.procedure
    .input<{ text: string }>()
    .action(async ({ input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const value = arkType({ text: "string" })(input);
          if (value instanceof arkType.errors) {
            return yield* Effect.fail(
              MainIpcError.invalidRequest("Clipboard text is required."),
            );
          }
          return readClipboardSourceUrl(value.text);
        }),
      ),
    ),
  appSetLanguage: t.procedure.input<string>().action(async ({ input }) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const value = arkType("string")(input);
        if (value instanceof arkType.errors) {
          return yield* Effect.fail(
            MainIpcError.invalidRequest("Language is required."),
          );
        }
        return yield* Effect.try({
          catch: (cause) => MainIpcError.operationFailed(cause),
          try: () => {
            const language = setMainLanguage(value);
            rebuildApplicationMenu();
            refreshSettingsWindowTitle();
            scheduleTrayRefresh();
            return language;
          },
        });
      }),
    ),
  ),
  daemonMobileHostingGet: t.procedure.action(async () =>
    Effect.runPromise(Effect.sync(() => getMobileHostingState())),
  ),
  daemonMobileHostingListenAddresses: t.procedure.action(async () =>
    Effect.runPromise(Effect.sync(() => listMobileHostingListenAddresses())),
  ),
  daemonMobileHostingSet: t.procedure
    .input<MobileHostingUpdate>()
    .action(async ({ input }) =>
      Effect.runPromise(
        Effect.tryPromise({
          catch: (cause) => MainIpcError.operationFailed(cause),
          try: () => setMobileHostingConfig(input),
        }),
      ),
    ),
};

export function createAppRouter() {
  return {
    ...appIpcRouter,
    ...keybindingsPlatformIpcRouter,
    ...pathLauncherPlatformIpcRouter,
    ...projectPlatformIpcRouter,
    ...usagePlatformIpcRouter,
    ...trayPlatformIpcRouter,
  };
}

export type AppRouter = ReturnType<typeof createAppRouter>;

type MissingFromAllowList = Exclude<keyof AppRouter, TipcChannel>;
type ExtraInAllowList = Exclude<TipcChannel, keyof AppRouter>;

const allowListMatchesRouter: [MissingFromAllowList, ExtraInAllowList] extends [
  never,
  never,
]
  ? true
  : never = true;
void allowListMatchesRouter;
