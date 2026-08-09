import { tipc } from "@egoist/tipc/main";
import { MainIpcError } from "../../platform/errors";
import { getUsageSnapshot, refreshUsageSnapshot } from "./service";

const t = tipc.create();

export const usagePlatformIpcRouter = {
  usageGetSnapshot: t.procedure.action(async () => {
    try {
      return await getUsageSnapshot();
    } catch (cause) {
      throw MainIpcError.operationFailed(cause);
    }
  }),
  usageRefresh: t.procedure.action(async () => {
    try {
      return await refreshUsageSnapshot();
    } catch (cause) {
      throw MainIpcError.operationFailed(cause);
    }
  }),
};
