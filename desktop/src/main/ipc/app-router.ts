import { chatIpcRouter } from "../features/chat/ipc";
import { projectIpcRouter } from "../features/projects/ipc";

export const appRouter = {
  ...chatIpcRouter,
  ...projectIpcRouter,
};

export type AppRouter = typeof appRouter;
