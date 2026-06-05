import type { ChatRuntime } from "../features/chat/runtime";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import { createAgentIpcRouter } from "../features/agents/ipc";
import { createChatIpcRouter } from "../features/chat/ipc";
import { projectIpcRouter } from "../features/projects/ipc";
import { workspaceToolsIpcRouter } from "../features/workspace-tools/ipc";
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
    ...createAgentIpcRouter(chatRuntime),
    ...createChatIpcRouter(chatRuntime),
    ...projectIpcRouter,
    ...workspaceToolsIpcRouter,
  };
}

export type AppRouter = ReturnType<typeof createAppRouter>;
