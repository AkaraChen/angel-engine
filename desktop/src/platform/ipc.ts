import type { AppRouter } from "../main/ipc/app-router";

import { createClient } from "@egoist/tipc/renderer";

export const ipc = createClient<AppRouter>({
  ipcInvoke: window.ipcInvoke,
});
