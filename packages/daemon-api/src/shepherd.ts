import { type as arkType } from "arktype";

/** Visible shepherd state machine. */
export type ShepherdState = "off" | "watching" | "queued" | "settled";

/** Why a session left the active loop. */
export type ShepherdSettledReason =
  | "green"
  | "blocked"
  | "budget"
  | "stopped"
  | "yielded"
  | "closed";

/**
 * Why a watching session is not sending right now.
 * Projected live by the daemon from the send gate — not renderer-inferred.
 */
export type ShepherdHoldReason =
  | "waiting_for_you"
  | "queued_run"
  | "ambiguous_run";

export interface ShepherdSession {
  id: string;
  chatId: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string | null;
  state: ShepherdState;
  settledReason: ShepherdSettledReason | null;
  /**
   * Live gate hold while `state === "watching"`. Always projected on read;
   * null when not held or not watching.
   */
  holdReason: ShepherdHoldReason | null;
  round: number;
  maxRounds: number;
  consecutiveNoProgress: number;
  /** Dedup keys: `databaseId:attempt` / comment id. */
  handledFingerprints: string[];
  /** Opaque baseline for UI/audit; daemon re-fetches on restore. */
  baselineSnapshot: unknown | null;
  /**
   * Prompt + fingerprints staged while waiting for the chat to go idle.
   * Merged when more findings arrive before the send fires.
   */
  pendingPrompt: string | null;
  pendingFingerprints: string[];
  /** Head SHA at the last shepherd send — used for no-progress detection. */
  lastSentHeadSha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShepherdStartInput {
  chatId: string;
  owner: string;
  repo: string;
  prNumber: number;
  maxRounds?: number;
}

export interface ShepherdStopInput {
  id: string;
}

export interface ShepherdResumeInput {
  id: string;
}

export interface ShepherdGetQuery {
  chatId: string;
}

export const shepherdStartInputSchema = arkType({
  "+": "ignore",
  chatId: "string > 0",
  owner: "string > 0",
  repo: "string > 0",
  prNumber: "number",
  "maxRounds?": "number",
});

export const shepherdStopInputSchema = arkType({
  "+": "ignore",
  id: "string > 0",
});

export const shepherdResumeInputSchema = arkType({
  "+": "ignore",
  id: "string > 0",
});

export const DEFAULT_SHEPHERD_MAX_ROUNDS = 10;
export const SHEPHERD_NO_PROGRESS_LIMIT = 2;
