import type {
  Chat,
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

export type ImportSessionItemStatus =
  | "pending"
  | "importing"
  | "success"
  | "failed"
  | "skipped";

export interface ImportSessionItemResult {
  chatId?: string;
  error?: string;
  remoteId: string;
  status: ImportSessionItemStatus;
  title: string;
}

export interface ImportSessionsBatchResult {
  failed: number;
  items: ImportSessionItemResult[];
  skipped: number;
  succeeded: number;
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
  if (!is.nonEmptyString(input.projectId)) {
    throw new Error("Project is required to import a session.");
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

/** Normalize free-text query for title/id/cwd matching. */
export function normalizeImportSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Filter importable sessions by title, remote id, cwd, or updatedAt substring.
 */
export function filterImportableSessions(
  sessions: readonly ImportableSession[],
  query: string,
): ImportableSession[] {
  const normalized = normalizeImportSearchQuery(query);
  if (!is.nonEmptyString(normalized)) return [...sessions];
  return sessions.filter((session) => {
    const haystack = [
      session.title,
      session.remoteId,
      session.cwd,
      session.updatedAt,
    ]
      .filter(is.nonEmptyString)
      .join("\n")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

/**
 * Map remote session ids that already exist as chats for the same runtime.
 * Keyed by remote id → first matching local chat id.
 */
export function alreadyImportedRemoteIds(
  existingChats: readonly Chat[],
  runtime: string,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!is.nonEmptyString(runtime)) return map;
  for (const chat of existingChats) {
    if (chat.runtime !== runtime) continue;
    if (!is.nonEmptyString(chat.remoteThreadId)) continue;
    if (map.has(chat.remoteThreadId)) continue;
    map.set(chat.remoteThreadId, chat.id);
  }
  return map;
}

/**
 * Toggle one id in a selection set. With `shift` + anchor, selects the range
 * between the anchor and the target in `orderedIds` order.
 * Returns the next selected set and the new anchor id.
 */
export function toggleImportSelection(options: {
  anchorId: string | null;
  orderedIds: readonly string[];
  remoteId: string;
  selected: ReadonlySet<string>;
  shift: boolean;
}): { anchorId: string; selected: Set<string> } {
  const { orderedIds, remoteId, shift } = options;
  const next = new Set(options.selected);

  if (
    shift &&
    is.nonEmptyString(options.anchorId) &&
    orderedIds.includes(options.anchorId) &&
    orderedIds.includes(remoteId)
  ) {
    const start = orderedIds.indexOf(options.anchorId);
    const end = orderedIds.indexOf(remoteId);
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    for (let index = from; index <= to; index += 1) {
      next.add(orderedIds[index]!);
    }
    return { anchorId: remoteId, selected: next };
  }

  if (next.has(remoteId)) {
    next.delete(remoteId);
  } else {
    next.add(remoteId);
  }
  return { anchorId: remoteId, selected: next };
}

/** Select every id in `orderedIds` (typically the currently filtered list). */
export function selectAllImportIds(orderedIds: readonly string[]): Set<string> {
  return new Set(orderedIds);
}

export function clearImportSelection(): Set<string> {
  return new Set();
}

/**
 * Why the primary import action is disabled. Null means import can proceed.
 */
export function importSubmitBlockReason(options: {
  hasProject: boolean;
  hasRuntime: boolean;
  importing: boolean;
  selectedCount: number;
}): "runtime" | "project" | "selection" | "importing" | null {
  if (options.importing) return "importing";
  if (!options.hasRuntime) return "runtime";
  if (!options.hasProject) return "project";
  if (options.selectedCount <= 0) return "selection";
  return null;
}

/**
 * Import selected sessions sequentially. Continues after individual failures
 * so partial success is preserved. Already-imported ids that the caller still
 * selected create a new chat copy (explicit user choice).
 */
export async function importSessionsBatch(
  api: ImportSessionApi,
  options: {
    cwd?: string | null;
    onProgress?: (items: ImportSessionItemResult[]) => void;
    projectId: string;
    remoteIds: readonly string[];
    runtime: string;
    sessionsById: ReadonlyMap<string, ImportableSession>;
  },
): Promise<ImportSessionsBatchResult> {
  if (!is.nonEmptyString(options.runtime)) {
    throw new Error("Runtime is required to import a session.");
  }
  if (!is.nonEmptyString(options.projectId)) {
    throw new Error("Project is required to import a session.");
  }
  if (options.remoteIds.length === 0) {
    return { failed: 0, items: [], skipped: 0, succeeded: 0 };
  }

  const items: ImportSessionItemResult[] = options.remoteIds.map((remoteId) => {
    const session = options.sessionsById.get(remoteId);
    return {
      remoteId,
      status: "pending" as const,
      title: session ? importableSessionPrimaryLabel(session) : remoteId,
    };
  });

  const emit = () => options.onProgress?.(items.map((item) => ({ ...item })));
  emit();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const session = options.sessionsById.get(item.remoteId);
    item.status = "importing";
    emit();
    try {
      const imported = await importSessionAndOpen(api, {
        cwd: session?.cwd ?? options.cwd ?? undefined,
        projectId: options.projectId,
        remoteThreadId: item.remoteId,
        runtime: options.runtime,
        title: session?.title ?? undefined,
      });
      item.status = "success";
      item.chatId = imported.chat.id;
      item.error = undefined;
    } catch (cause) {
      item.status = "failed";
      item.error = cause instanceof Error ? cause.message : "Import failed";
    }
    emit();
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const item of items) {
    if (item.status === "success") succeeded += 1;
    else if (item.status === "failed") failed += 1;
    else if (item.status === "skipped") skipped += 1;
  }

  return { failed, items, skipped, succeeded };
}

/** Collect remote ids from failed items for retry. */
export function failedImportRemoteIds(
  items: readonly ImportSessionItemResult[],
): string[] {
  return items
    .filter((item) => item.status === "failed")
    .map((item) => item.remoteId);
}

/** Successful chat ids in import order (for navigation/refetch). */
export function successfulImportChatIds(
  items: readonly ImportSessionItemResult[],
): string[] {
  return items.flatMap((item) =>
    item.status === "success" && is.nonEmptyString(item.chatId)
      ? [item.chatId]
      : [],
  );
}
