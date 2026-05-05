import { createClient } from "@egoist/tipc/renderer";

import type { AppRouter } from "../main/router";

export const ipc = createClient<AppRouter>({
  ipcInvoke: window.ipcInvoke,
});
