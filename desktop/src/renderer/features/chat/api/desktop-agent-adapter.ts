import type {
  AgentAdapter,
  AgentRunContext,
  ChatStreamEvent as ClientChatStreamEvent,
} from "@angel-engine/js-client";
import type {
  ChatSendInput,
  ChatStreamController,
  ChatStreamEvent,
} from "@shared/chat";

interface DesktopAgentAdapterOptions {
  onController?: (controller: ChatStreamController) => void;
}

export function createDesktopAgentAdapter({
  onController,
}: DesktopAgentAdapterOptions = {}): AgentAdapter {
  return {
    id: "desktop",
    run: (input, context) =>
      streamDesktopChatEvents(
        input as ChatSendInput,
        context,
        onController,
      ) as AsyncIterable<ClientChatStreamEvent>,
  };
}

async function* streamDesktopChatEvents(
  input: ChatSendInput,
  context: AgentRunContext,
  onController?: (controller: ChatStreamController) => void,
) {
  const events = new AsyncEventQueue<ChatStreamEvent>();
  const controller = window.chatStream.send(input, (event) =>
    events.push(event),
  );
  const abort = () => events.push({ type: "done" });
  onController?.(controller);

  context.signal.addEventListener("abort", abort, { once: true });

  try {
    while (!context.signal.aborted) {
      const event = await events.next();
      yield event;
      if (event.type === "done") break;
    }
  } finally {
    context.signal.removeEventListener("abort", abort);
    controller.cancel();
  }
}

class AsyncEventQueue<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<(item: T) => void> = [];

  async next() {
    const item = this.items.shift();
    if (item !== undefined) {
      return Promise.resolve(item);
    }

    return new Promise<T>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  push(item: T) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }

    this.items.push(item);
  }
}
