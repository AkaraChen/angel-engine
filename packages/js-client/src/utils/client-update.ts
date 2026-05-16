import type { ClientUpdate } from "@angel-engine/client-napi";

export function emptyUpdate(): ClientUpdate {
  return {
    completedRequestIds: [],
    events: [],
    logs: [],
    outgoing: [],
    streamDeltas: [],
  };
}
