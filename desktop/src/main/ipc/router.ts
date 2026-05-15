import type { ChatRuntime } from "../features/chat/runtime";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import { createChatIpcRouter } from "../features/chat/ipc";
import { projectIpcRouter } from "../features/projects/ipc";
import { setMainLanguage } from "../platform/i18n";

const t = tipc.create();

const appIpcRouter = {
  appSetLanguage: t.procedure.input<string>().action(async ({ input }) => {
    const value = arkType("string")(input);
    if (value instanceof arkType.errors) {
      throw new TypeError("Language is required.");
    }
    return setMainLanguage(value);
  }),
};

export function createAppRouter(chatRuntime: ChatRuntime) {
  return {
    ...appIpcRouter,
    ...createChatIpcRouter(chatRuntime),
    ...projectIpcRouter,
  };
}

export type AppRouter = ReturnType<typeof createAppRouter>;
