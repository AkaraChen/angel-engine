import type {
  ImportChatInput,
  ImportChatResult,
  ImportableSession,
  ListImportableSessionsInput,
  ListImportableSessionsResult,
} from "@angel-engine/daemon-api/chat";
import is from "@sindresorhus/is";

/** Minimal chat client surface used by import dialog handlers. */
export interface ImportSessionChatApi {
  importSession: (input: ImportChatInput) => Promise<ImportChatResult>;
  listImportableSessions: (
    input: ListImportableSessionsInput,
  ) => Promise<ListImportableSessionsResult>;
}

export interface ImportSessionApi {
  chats: ImportSessionChatApi;
}

/**
 * Auto-search importable sessions for a runtime + directory scope.
 * Desktop dialogs call this on open; the daemon owns agent-specific discovery.
 */
export async function searchImportableSessions(
  api: ImportSessionApi,
  input: ListImportableSessionsInput,
): Promise<ListImportableSessionsResult> {
  if (!is.nonEmptyString(input.runtime)) {
    throw new Error("Runtime is required to search importable sessions.");
  }
  return api.chats.listImportableSessions(input);
}

/**
 * Import a remote session into a desktop chat and return the open/hydrate result.
 */
export async function importSessionAndOpen(
  api: ImportSessionApi,
  input: ImportChatInput,
): Promise<ImportChatResult> {
  if (!is.nonEmptyString(input.runtime)) {
    throw new Error("Runtime is required to import a session.");
  }
  if (!is.nonEmptyString(input.remoteThreadId)) {
    throw new Error("Remote session id is required to import a session.");
  }
  return api.chats.importSession(input);
}

export function importableSessionPrimaryLabel(
  session: ImportableSession,
): string {
  if (is.nonEmptyString(session.title)) return session.title;
  return session.remoteId;
}

export function importableSessionSecondaryLabel(
  session: ImportableSession,
): string | null {
  const parts: string[] = [];
  if (is.nonEmptyString(session.cwd)) parts.push(session.cwd);
  if (is.nonEmptyString(session.updatedAt)) parts.push(session.updatedAt);
  if (parts.length === 0 && is.nonEmptyString(session.remoteId)) {
    return session.remoteId;
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
