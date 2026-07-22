import type { TipcChannel } from "../../shared/ipc-channels";
import type { MobileHostingUpdate } from "../../shared/mobile-hosting";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import { Effect } from "effect";
import {
  getMobileHostingState,
  setMobileHostingConfig,
} from "../daemon/supervisor";
import { listMobileHostingListenAddresses } from "../daemon/mobile-hosting";
import { chatPlatformIpcRouter } from "../features/chat/ipc";
import { projectPlatformIpcRouter } from "../features/projects/ipc";
import { MainIpcError } from "../platform/errors";
import { setMainLanguage } from "../platform/i18n";
import { readClipboardSourceUrl } from "./clipboard-source";
import { fetchUrlPreview } from "./url-preview";

const t = tipc.create();

const appIpcRouter = {
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
          try: () => setMainLanguage(value),
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
    ...chatPlatformIpcRouter,
    ...projectPlatformIpcRouter,
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
