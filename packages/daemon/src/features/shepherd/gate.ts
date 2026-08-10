import type { ChatActivity } from "@angel-engine/daemon-api/chat";

/**
 * Shepherd send gate.
 *
 * Idle → send now.
 * Running → queue until the chat settles.
 * Waiting for user / existing queued chat run / ambiguous send → hold in watching.
 */
export type ShepherdGateDecision =
  | { action: "send" }
  | { action: "queue" }
  | {
      action: "hold";
      reason: "waiting_for_you" | "queued_run" | "ambiguous_run";
    };

export interface ShepherdGateInput {
  activity: ChatActivity | null;
  hasQueuedChatRun: boolean;
  hasAmbiguousChatRun: boolean;
}

export function evaluateShepherdGate(
  input: ShepherdGateInput,
): ShepherdGateDecision {
  if (input.hasAmbiguousChatRun) {
    return { action: "hold", reason: "ambiguous_run" };
  }
  if (input.hasQueuedChatRun) {
    return { action: "hold", reason: "queued_run" };
  }

  const status = input.activity?.status;
  if (status === "waiting_for_you") {
    return { action: "hold", reason: "waiting_for_you" };
  }
  if (status === "running" || status === "stuck") {
    return { action: "queue" };
  }
  // done / failed / no activity → idle enough to send
  return { action: "send" };
}

export function isShepherdYieldOrigin(
  origin: string | undefined | null,
): boolean {
  return origin !== "shepherd";
}
