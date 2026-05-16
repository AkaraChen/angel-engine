import { EngineEventType } from "@angel-engine/client-napi";
import type { ClaudeEngineEventJson, ClaudeJsonObject } from "./types.js";

export function contextUpdated(
  conversationId: string,
  updates: ClaudeEngineEventJson[],
): ClaudeEngineEventJson {
  return {
    [EngineEventType.ContextUpdated]: {
      conversation_id: conversationId,
      patch: contextPatch(updates),
    },
  };
}

export function contextPatch(
  updates: ClaudeEngineEventJson[],
): ClaudeJsonObject {
  return {
    updates: updates.filter((update) => {
      const payload = Object.values(update)[0] as Record<string, unknown>;
      if ("cwd" in payload && payload.cwd === undefined) return false;
      return !("directories" in payload && !Array.isArray(payload.directories));
    }),
  };
}
