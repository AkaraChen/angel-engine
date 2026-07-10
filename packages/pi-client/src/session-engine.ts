import type {
  AngelEngineClient,
  ClientCommandResult,
  ClientUpdate,
  SendTextRequest,
  TurnRunEvent,
} from "@angel-engine/client-napi";
import type { EngineEventJson } from "./types.js";

import { emptyUpdate } from "@angel-engine/js-client/utils/client-update";
import is from "@sindresorhus/is";
import { turnRunEventsFromUpdate } from "./events.js";

export function applyEngineEvents(
  client: AngelEngineClient,
  events: EngineEventJson[],
): ClientUpdate {
  if (events.length === 0) return emptyUpdate();
  return client.receiveJson({
    jsonrpc: "2.0",
    method: "pi/event",
    params: { events },
  });
}

export function emitEngineEvents(
  client: AngelEngineClient,
  events: EngineEventJson[],
  onEvent?: (event: TurnRunEvent) => void,
): void {
  const update = applyEngineEvents(client, events);
  for (const event of turnRunEventsFromUpdate(update)) {
    onEvent?.(event);
  }
}

export function startConversation(
  client: AngelEngineClient,
  cwd: string | undefined,
): ClientCommandResult {
  if (!is.string(cwd) || cwd.length === 0) {
    throw new Error("Pi conversation cwd is required.");
  }
  return client.startThread({ cwd });
}

export function startEngineTurn(
  client: AngelEngineClient,
  conversationId: string,
  text: string,
  input: SendTextRequest["input"],
): { turnId: string } {
  const result = client.sendThreadEvent(conversationId, {
    input: [{ text, type: "text" }, ...(input ?? [])],
    type: "inputs",
  });
  if (!result.turnId) {
    throw new Error("Pi runtime turn did not produce an engine turn id.");
  }
  return { turnId: result.turnId };
}
