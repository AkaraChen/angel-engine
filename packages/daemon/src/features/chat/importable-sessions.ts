import type { ListImportableSessionsResult } from "@angel-engine/daemon-api/chat";
import type { ListImportableSessionsResult as NativeListImportableSessionsResult } from "@angel-engine/client-napi";

import is from "@sindresorhus/is";

export function emptyImportableResult(
  unsupportedReason?: string,
): ListImportableSessionsResult {
  return {
    nextCursor: null,
    sessions: [],
    unsupportedReason: unsupportedReason ?? null,
  };
}

/**
 * Map the generated NAPI list result into the daemon API shape.
 * Requires a non-null `sessions` array from the binding; rejects empty remote ids.
 */
export function mapNativeImportableResult(
  value: NativeListImportableSessionsResult,
): ListImportableSessionsResult {
  if (!Array.isArray(value.sessions)) {
    throw new Error(
      "Native listImportableSessions response is missing sessions array.",
    );
  }
  const sessions = value.sessions
    .filter((session) => is.nonEmptyString(session.remoteId))
    .map((session) => ({
      cwd: session.cwd ?? null,
      remoteId: session.remoteId,
      title: session.title ?? null,
      updatedAt: session.updatedAt ?? null,
    }));
  if (sessions.length !== value.sessions.length) {
    throw new Error(
      "Native listImportableSessions response contained an empty remote id.",
    );
  }
  return {
    nextCursor: value.nextCursor ?? null,
    sessions,
    unsupportedReason: value.unsupportedReason ?? null,
  };
}
