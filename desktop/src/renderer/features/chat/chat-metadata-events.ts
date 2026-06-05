const chatMetadataBroadcastChannel = "angel-engine.chat-metadata.v1";
const senderId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());

interface ChatMetadataEvent {
  senderId: string;
  type: "changed" | "delete-all";
}

const broadcastChannel = createBroadcastChannel();

export function broadcastAllChatsDeleted() {
  broadcastChannel?.postMessage({
    senderId,
    type: "delete-all",
  } satisfies ChatMetadataEvent);
}

export function broadcastChatsChanged() {
  broadcastChannel?.postMessage({
    senderId,
    type: "changed",
  } satisfies ChatMetadataEvent);
}

export function subscribeToChatMetadataEvents(
  handler: (event: ChatMetadataEvent) => void,
) {
  if (broadcastChannel === null) return () => {};

  const listener = (event: MessageEvent<unknown>) => {
    const message = readChatMetadataEvent(event.data);
    if (message === null || message.senderId === senderId) return;
    handler(message);
  };

  broadcastChannel.addEventListener("message", listener);
  return () => {
    broadcastChannel.removeEventListener("message", listener);
  };
}

function readChatMetadataEvent(value: unknown): ChatMetadataEvent | null {
  if (value === null || typeof value !== "object") return null;
  const input = value as Partial<ChatMetadataEvent>;
  if (typeof input.senderId !== "string") return null;
  if (input.type !== "changed" && input.type !== "delete-all") return null;

  return {
    senderId: input.senderId,
    type: input.type,
  };
}

function createBroadcastChannel() {
  try {
    return new BroadcastChannel(chatMetadataBroadcastChannel);
  } catch {
    return null;
  }
}
