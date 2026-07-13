import type {
  ChatSendInput,
  ChatStreamController,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type {
  AgentAdapter,
  AgentRunContext,
  ChatStreamEvent as ClientChatStreamEvent,
} from "@angel-engine/js-client";
import { getDaemonTransport } from "@/platform/daemon-transport";

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
        input,
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
  const streamId = crypto.randomUUID();
  const transport = getDaemonTransport();
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  const controller: ChatStreamController = {
    cancel() {
      abortController.abort();
      void transport.fetch(`/api/chat-streams/${streamId}`, {
        method: "DELETE",
      });
    },
    async resolveElicitation({ elicitationId, response }) {
      const result = await transport.fetch(
        `/api/chat-streams/${streamId}/elicitation`,
        {
          body: JSON.stringify({ elicitationId, response }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (!result.ok)
        throw new Error(`Could not resolve elicitation (${result.status}).`);
    },
  };
  onController?.(controller);
  context.signal.addEventListener("abort", abort, { once: true });

  try {
    const response = await transport.fetch(
      `/api/chat-streams?streamId=${encodeURIComponent(streamId)}`,
      {
        body: JSON.stringify(input),
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
        signal: abortController.signal,
      },
    );
    if (!response.ok || response.body === null) {
      throw new Error(`Chat stream failed (${response.status}).`);
    }
    for await (const event of parseSse(response.body)) {
      yield event;
      if (event.type === "done") return;
    }
  } finally {
    context.signal.removeEventListener("abort", abort);
    abortController.abort();
  }
}

async function* parseSse(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data.length > 0) yield JSON.parse(data) as ChatStreamEvent;
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
