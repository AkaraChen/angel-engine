import type {
  ChatElicitationResponse,
  ChatStreamController,
} from "@angel-engine/daemon-api/chat";

/**
 * Side-effectful handles of an in-flight run. These live outside the machine
 * context so the state stays pure and serializable; the context references
 * runs by `runId` only.
 */
export interface RunHandles {
  abortController: AbortController;
  autoApprovedPermissionIds: Set<string>;
  cancelled: boolean;
  resolveElicitationLocally?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => void;
  streamController?: ChatStreamController;
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

/** Marks the run cancelled and aborts its stream; keeps the entry until disposal. */
export function cancelRunHandles(runId: string) {
  const handles = runHandles.get(runId);
  if (!handles) return;
  handles.cancelled = true;
  handles.abortController.abort();
}

export function disposeRunHandles(runId: string) {
  runHandles.delete(runId);
}
