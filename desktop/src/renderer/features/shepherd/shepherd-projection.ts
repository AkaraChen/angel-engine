import type {
  ShepherdHoldReason,
  ShepherdSession,
  ShepherdState,
} from "@angel-engine/daemon-api/shepherd";

/** Manual stop and user-yield both leave a resumable terminal session. */
export function isResumableShepherdSession(
  session: ShepherdSession | null | undefined,
): boolean {
  return (
    session?.state === "settled" &&
    (session.settledReason === "stopped" || session.settledReason === "yielded")
  );
}

/**
 * Passive yield toast only when the daemon marks `yielded` — never on manual
 * `stopped` from the stop button / command palette.
 */
export function shouldShowShepherdYieldToast(
  previous: ShepherdState | "off" | null,
  session: ShepherdSession | null | undefined,
): boolean {
  if (previous === null) return false;
  if (previous !== "watching" && previous !== "queued") return false;
  return (
    session?.state === "settled" &&
    session.settledReason === "yielded" &&
    typeof session.id === "string" &&
    session.id.length > 0
  );
}

/** Hold copy is projected by daemon; renderer only maps the enum to i18n. */
export function shepherdHoldReason(
  session: ShepherdSession | null | undefined,
): ShepherdHoldReason | null {
  if (session?.state !== "watching") return null;
  return session.holdReason;
}
