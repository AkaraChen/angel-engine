const terminalSelectionBroadcastChannel =
  "angel-engine.terminal-selection-to-composer.v1";
const terminalSelectionCharacterLimit = 12_000;
const senderId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());

export interface TerminalSelectionInsert {
  cwd: string;
  selection: string;
}

interface TerminalSelectionInsertMessage {
  id: string;
  markdown: string;
  senderId: string;
}

type TerminalSelectionInsertHandler = (markdown: string) => void;

const localHandlers = new Set<TerminalSelectionInsertHandler>();
const broadcastChannel = createBroadcastChannel();

broadcastChannel?.addEventListener(
  "message",
  (event: MessageEvent<unknown>) => {
    const message = readTerminalSelectionInsertMessage(event.data);
    if (message === null || message.senderId === senderId) return;
    notifyLocalHandlers(message);
  },
);

export function publishTerminalSelectionInsert(
  insertion: TerminalSelectionInsert,
) {
  const message: TerminalSelectionInsertMessage = {
    id: crypto.randomUUID(),
    markdown: formatTerminalSelectionForComposer(insertion),
    senderId,
  };
  notifyLocalHandlers(message);
  broadcastChannel?.postMessage(message);
}

export function subscribeToTerminalSelectionInserts(
  handler: TerminalSelectionInsertHandler,
) {
  localHandlers.add(handler);
  return () => {
    localHandlers.delete(handler);
  };
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

export function appendComposerMarkdown(current: string, insertion: string) {
  const existing = current.trimEnd();
  return existing.length === 0 ? insertion : `${existing}\n\n${insertion}`;
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

function notifyLocalHandlers(message: TerminalSelectionInsertMessage) {
  for (const handler of localHandlers) handler(message.markdown);
}

function readTerminalSelectionInsertMessage(
  value: unknown,
): TerminalSelectionInsertMessage | null {
  if (value === null || typeof value !== "object") return null;
  const input = value as Partial<TerminalSelectionInsertMessage>;
  if (
    typeof input.id !== "string" ||
    typeof input.markdown !== "string" ||
    typeof input.senderId !== "string"
  ) {
    return null;
  }

  return {
    id: input.id,
    markdown: input.markdown,
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
