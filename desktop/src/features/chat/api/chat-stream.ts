import type {
  ChatStreamController,
  ChatSendInput,
  ChatStreamEvent,
} from "@/shared/chat";

export async function* streamChatEvents(
  input: ChatSendInput,
  abortSignal: AbortSignal,
  onController?: (controller: ChatStreamController) => void,
) {
  const events = new AsyncEventQueue<ChatStreamEvent>();
  const controller = window.chatStream.send(input, (event) =>
    events.push(event),
  );
  const abort = () => events.push({ type: "done" });
  onController?.(controller);

  abortSignal.addEventListener("abort", abort, { once: true });

  try {
    while (!abortSignal.aborted) {
      const event = await events.next();
      yield event;
      if (event.type === "done") break;
    }
  } finally {
    abortSignal.removeEventListener("abort", abort);
    controller.cancel();
  }
}

class AsyncEventQueue<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<(item: T) => void> = [];

  next() {
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
