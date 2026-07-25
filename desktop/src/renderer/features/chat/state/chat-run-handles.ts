import type { ChatElicitationResponse } from "@angel-engine/daemon-api/chat";
import type { ChatStreamElicitationInput } from "@angel-engine/daemon-client";

/**
 * Side-effectful handles of an in-flight run. These live outside the machine
 * context so the state stays pure and serializable; the context references
 * runs by `runId` only.
 *
 * `abortController` aborts the *observer*, never the run itself. The run
 * belongs to the daemon; only an explicit Stop ends it.
 */
export interface RunHandles {
  abortController: AbortController;
  autoApprovedPermissionIds: Set<string>;
  cancelled: boolean;
  /** Set while an observer is attached; forwards to the daemon run. */
  resolveElicitation?: (input: ChatStreamElicitationInput) => Promise<void>;
  resolveElicitationLocally?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => void;
}

const runHandles = new Map<string, RunHandles>();

export function createRunHandles(runId: string): RunHandles {
  const handles: RunHandles = {
    abortController: new AbortController(),
    autoApprovedPermissionIds: new Set(),
    cancelled: false,
  };
  runHandles.set(runId, handles);
  return handles;
}

export function getRunHandles(runId: string): RunHandles | undefined {
  return runHandles.get(runId);
}

/**
 * Detaches this window's observer and settles the run locally. The daemon run
 * keeps executing; `chatRunActions.cancelRun` / `dropRun` own stopping it.
 */
export function cancelRunHandles(runId: string) {
  const handles = runHandles.get(runId);
  if (!handles) return;
  handles.cancelled = true;
  handles.abortController.abort();
}

export function disposeRunHandles(runId: string) {
  runHandles.delete(runId);
}
