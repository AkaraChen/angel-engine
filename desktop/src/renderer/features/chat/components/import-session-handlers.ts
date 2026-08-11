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

/** One importable session tagged with the agent it was discovered under. */
export interface ImportableSessionRow {
  key: string;
  runtime: string;
  runtimeLabel: string;
  session: ImportableSession;
}

export interface ImportableRuntimeOption {
  label: string;
  value: string;
}

export interface LoadImportableSessionsResult {
  /** Agents that answered but could not be searched, keyed by runtime id. */
  failures: Map<string, string>;
  rows: ImportableSessionRow[];
}

/**
 * A session is only unique per agent: two agents can hand back the same remote
 * id for unrelated threads, so selection keys carry the runtime.
 */
export function importableSessionRowKey(
  runtime: string,
  session: ImportableSession,
): string {
  return `${runtime}:${session.remoteId}`;
}

/**
 * Search every enabled agent at once so the user never has to declare which
 * agent a session came from before they can look for it. Agents are searched
 * concurrently and a failing agent degrades to a note rather than emptying the
 * whole list.
 */
export async function loadImportableSessions(
  api: ImportSessionApi,
  {
    cwd,
    projectId,
    runtimes,
  }: {
    cwd?: string | null;
    projectId?: string | null;
    runtimes: ImportableRuntimeOption[];
  },
): Promise<LoadImportableSessionsResult> {
  const settled = await Promise.all(
    runtimes.map(async (runtime) => {
      try {
        const result = await searchImportableSessions(api, {
          cwd: cwd ?? undefined,
          projectId: projectId ?? undefined,
          runtime: runtime.value,
        });
        const unsupportedReason = result.unsupportedReason;
        if (is.nonEmptyString(unsupportedReason)) {
          return { reason: unsupportedReason, result: null, runtime };
        }
        return { reason: null, result, runtime };
      } catch (cause) {
        return {
          reason: cause instanceof Error ? cause.message : String(cause),
          result: null,
          runtime,
        };
      }
    }),
  );

  const failures = new Map<string, string>();
  const rows: ImportableSessionRow[] = [];
  for (const entry of settled) {
    if (entry.result === null) {
      failures.set(entry.runtime.value, entry.reason ?? "");
      continue;
    }
    for (const session of entry.result.sessions) {
      rows.push({
        key: importableSessionRowKey(entry.runtime.value, session),
        runtime: entry.runtime.value,
        runtimeLabel: entry.runtime.label,
        session,
      });
    }
  }
  return { failures, rows };
}

/** Free-text match over the fields the row actually renders. */
export function filterImportableSessionRows(
  rows: ImportableSessionRow[],
  { query, runtime }: { query: string; runtime: string | null },
): ImportableSessionRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (runtime !== null && row.runtime !== runtime) return false;
    if (needle.length === 0) return true;
    const haystack = [
      row.session.title,
      row.session.cwd,
      row.session.remoteId,
      row.runtimeLabel,
    ]
      .filter((part): part is string => is.nonEmptyString(part))
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Shift-click range selection. Both ends are inclusive and the anchor may sit
 * after the target, so the caller does not have to normalize direction.
 */
export function selectionRange(
  keys: string[],
  anchorKey: string | null,
  targetKey: string,
): string[] {
  const target = keys.indexOf(targetKey);
  if (target < 0) return [];
  const anchor = anchorKey === null ? -1 : keys.indexOf(anchorKey);
  if (anchor < 0) return [targetKey];
  const start = Math.min(anchor, target);
  const end = Math.max(anchor, target);
  return keys.slice(start, end + 1);
}
