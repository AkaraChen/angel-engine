import type {
  ChatSendInput,
  ChatStreamController,
  ChatStreamEvent,
} from "@shared/chat";
import { createDesktopAgentAdapter } from "./desktop-agent-adapter";

export async function* streamChatEvents(
  input: ChatSendInput,
  abortSignal: AbortSignal,
  onController?: (controller: ChatStreamController) => void,
): AsyncIterable<ChatStreamEvent> {
  const adapter = createDesktopAgentAdapter({ onController });
  for await (const event of adapter.run(input, {
    messages: [],
    signal: abortSignal,
  })) {
    yield event;
  }
}
