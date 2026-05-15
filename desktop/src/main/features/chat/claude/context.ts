import type { EngineEventJson, JsonObject } from "./types";

import { EngineEventType } from "@angel-engine/client-napi";
import { isJsonObject } from "./utils";

export function contextUpdated(
  conversationId: string,
  updates: EngineEventJson[],
): EngineEventJson {
  return {
    [EngineEventType.ContextUpdated]: {
      conversation_id: conversationId,
      patch: contextPatch(updates),
    },
  };
}

export function contextPatch(updates: EngineEventJson[]): JsonObject {
  return {
    updates: updates.filter((update) => {
      const payload = Object.values(update)[0];
      if (!isJsonObject(payload)) return true;
      if ("cwd" in payload && payload.cwd === undefined) return false;
      return !("directories" in payload && !Array.isArray(payload.directories));
    }),
  };
}
