const terminalSelectionBroadcastChannel =
  "angel-engine.terminal-selection-to-composer.v1";
const terminalSelectionCharacterLimit = 12_000;
const senderId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());

export interface TerminalSelectionInsert {
  cwd: string;
  selection: string;
}

export interface ComposerTerminalSelection extends TerminalSelectionInsert {
  id: string;
}

interface TerminalSelectionInsertMessage {
  selection: ComposerTerminalSelection;
  senderId: string;
}

type TerminalSelectionInsertHandler = (
  selection: ComposerTerminalSelection,
) => void;

const localHandlers = new Set<TerminalSelectionInsertHandler>();
const broadcastChannel = createBroadcastChannel();
let pendingSelection: ComposerTerminalSelection | null = null;

broadcastChannel?.addEventListener(
  "message",
  (event: MessageEvent<unknown>) => {
    const message = readTerminalSelectionInsertMessage(event.data);
    if (message === null || message.senderId === senderId) return;
    deliverTerminalSelection(message.selection);
  },
);

export function publishTerminalSelectionInsert(
  insertion: TerminalSelectionInsert,
) {
  if (!hasTerminalSelection(insertion.selection)) return false;

  const selection: ComposerTerminalSelection = {
    cwd: insertion.cwd,
    id: crypto.randomUUID(),
    selection: insertion.selection,
  };
  deliverTerminalSelection(selection);
  broadcastChannel?.postMessage({ selection, senderId });
  return true;
}

export function subscribeToTerminalSelectionInserts(
  handler: TerminalSelectionInsertHandler,
) {
  localHandlers.add(handler);
  if (pendingSelection !== null) {
    const selection = pendingSelection;
    handler(selection);
    // React Strict Mode remounts effects in the same turn. Keep the pending
    // insert until after that recycle so the second mount still receives it.
    queueMicrotask(() => {
      if (pendingSelection === selection) {
        pendingSelection = null;
      }
    });
  }
  return () => {
    localHandlers.delete(handler);
  };
}

export function hasTerminalSelection(selection: string) {
  return selection.trim().length > 0;
}

/** Short single-line title for the composer chip. */
export function terminalSelectionLabel(selection: string) {
  const firstLine =
    selection
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

export function formatTerminalSelectionForComposer({
  cwd,
  selection,
}: TerminalSelectionInsert) {
  const normalizedCwd = cwd.replaceAll(/[\r\n]+/g, " ").trim();
  const { text, truncated } = truncateTerminalSelection(selection);
  const content = truncated
    ? `${text}\n… [terminal selection truncated]`
    : text;
  const fence = markdownFenceFor(content);

  return `Terminal selection (cwd: ${normalizedCwd})\n\n${fence}text\n${content}\n${fence}`;
}

export function appendTerminalSelections(
  text: string,
  selections: readonly ComposerTerminalSelection[],
) {
  if (selections.length === 0) return text;
  const block = selections
    .map((item) => formatTerminalSelectionForComposer(item))
    .join("\n\n");
  const trimmed = text.trimEnd();
  return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`;
}

function deliverTerminalSelection(selection: ComposerTerminalSelection) {
  if (localHandlers.size === 0) {
    pendingSelection = selection;
    return;
  }

  pendingSelection = null;
  for (const handler of localHandlers) handler(selection);
}

function truncateTerminalSelection(selection: string) {
  if (selection.length <= terminalSelectionCharacterLimit) {
    return { text: selection, truncated: false };
  }

  let text = selection.slice(0, terminalSelectionCharacterLimit);
  const finalCodeUnit = text.charCodeAt(text.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    text = text.slice(0, -1);
  }
  return { text, truncated: true };
}

function markdownFenceFor(content: string) {
  const longestFence = Math.max(
    0,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length),
  );
  return "`".repeat(Math.max(3, longestFence + 1));
}

function readTerminalSelectionInsertMessage(
  value: unknown,
): TerminalSelectionInsertMessage | null {
  if (value === null || typeof value !== "object") return null;
  const input = value as Partial<TerminalSelectionInsertMessage>;
  const selection = input.selection;
  if (
    typeof input.senderId !== "string" ||
    selection === undefined ||
    typeof selection.id !== "string" ||
    typeof selection.cwd !== "string" ||
    typeof selection.selection !== "string"
  ) {
    return null;
  }

  return {
    selection: {
      cwd: selection.cwd,
      id: selection.id,
      selection: selection.selection,
    },
    senderId: input.senderId,
  };
}

function createBroadcastChannel() {
  try {
    return new BroadcastChannel(terminalSelectionBroadcastChannel);
  } catch {
    return null;
  }
}
