import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";

import { chatIpcRouter } from "../features/chat/ipc";
import { projectIpcRouter } from "../features/projects/ipc";
import { setMainLanguage } from "../i18n";

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

export const appRouter = {
  ...appIpcRouter,
  ...chatIpcRouter,
  ...projectIpcRouter,
};

export type AppRouter = typeof appRouter;
