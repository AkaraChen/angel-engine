import type { TipcChannel } from "../../shared/ipc-channels";
import type { MobileHostingUpdate } from "../../shared/mobile-hosting";
import type { ChatRuntime } from "../features/chat/runtime";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import {
  getMobileHostingState,
  setMobileHostingConfig,
} from "../daemon/supervisor";
import { createAgentIpcRouter } from "../features/agents/ipc";
import { createChatIpcRouter } from "../features/chat/ipc";
import { projectIpcRouter } from "../features/projects/ipc";
import { workspaceToolsIpcRouter } from "../features/workspace-tools/ipc";
import { setMainLanguage } from "../platform/i18n";
import { readClipboardSourceUrl } from "./clipboard-source";

const t = tipc.create();

const appIpcRouter = {
  appReadClipboardSourceUrl: t.procedure
    .input<{ text: string }>()
    .action(async ({ input }) => {
      const value = arkType({ text: "string" })(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Clipboard text is required.");
      }
      return readClipboardSourceUrl(value.text);
    }),
  appSetLanguage: t.procedure.input<string>().action(async ({ input }) => {
    const value = arkType("string")(input);
    if (value instanceof arkType.errors) {
      throw new TypeError("Language is required.");
    }
    return setMainLanguage(value);
  }),
  daemonMobileHostingGet: t.procedure.action(async () =>
    getMobileHostingState(),
  ),
  daemonMobileHostingSet: t.procedure
    .input<MobileHostingUpdate>()
    .action(async ({ input }) => setMobileHostingConfig(input)),
};

export function createAppRouter(chatRuntime: ChatRuntime) {
  return {
    ...appIpcRouter,
    ...createAgentIpcRouter(chatRuntime),
    ...createChatIpcRouter(chatRuntime),
    ...projectIpcRouter,
    ...workspaceToolsIpcRouter,
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
