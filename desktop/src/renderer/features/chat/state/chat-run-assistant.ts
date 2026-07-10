import type {
  AssistantAccumulator,
  AssistantMaterializationCache,
  EngineMessage,
} from "./chat-run-types";
import {
  chatPartsText,
  cloneChatHistoryPart,
  isChatElicitationData,
  isChatToolAction,
  isTerminalChatToolPhase,
} from "@shared/chat";
import { historyPartToEngineMessagePart } from "./chat-run-history";
import { isClosedElicitationPhase } from "./chat-run-parts";

export function createAssistantMessage(
  id: string,
  accumulator: AssistantAccumulator,
  startedAt: number,
): EngineMessage {
  return assistantMessageFromContent(
    id,
    accumulator,
    startedAt,
    accumulator.parts
      .map(cloneChatHistoryPart)
      .map(historyPartToEngineMessagePart) as EngineMessage["content"],
  );
}

export function materializeAssistantMessage(
  id: string,
  accumulator: AssistantAccumulator,
  startedAt: number,
  cache: AssistantMaterializationCache,
  minDirtyIndex: number,
): EngineMessage {
  const content: Array<EngineMessage["content"][number]> = [];
  for (let index = 0; index < accumulator.parts.length; index += 1) {
    const cachedPart =
      index < minDirtyIndex ? cache.engineParts[index] : undefined;
    content.push(
      cachedPart ??
        historyPartToEngineMessagePart(
          cloneChatHistoryPart(accumulator.parts[index]),
        ),
    );
  }
  const engineContent = content as EngineMessage["content"];
  cache.engineParts = engineContent;
  return assistantMessageFromContent(id, accumulator, startedAt, engineContent);
}

function assistantMessageFromContent(
  id: string,
  accumulator: AssistantAccumulator,
  startedAt: number,
  content: EngineMessage["content"],
): EngineMessage {
  const text = chatPartsText(accumulator.parts, "text");
  const toolCallCount = accumulator.parts.filter(
    (part) => part.type === "tool-call",
  ).length;

  return {
    content,
    createdAt: new Date(),
    id,
    metadata: {
      custom: {
        model: accumulator.result?.model ?? "angel-engine-client",
        turnId: accumulator.result?.turnId,
      },
      steps: [],
      timing: {
        streamStartTime: startedAt,
        tokenCount: Math.max(1, Math.round(text.length / 4)),
        toolCallCount,
        totalChunks: Math.max(1, accumulator.chunkCount),
        totalStreamTime: performance.now() - startedAt,
      },
      unstable_annotations: [],
      unstable_data: [],
      unstable_state: null,
    },
    role: "assistant",
    status: accumulator.status,
  } as EngineMessage;
}

export function markAssistantMessageCancelled(
  messages: EngineMessage[],
  assistantMessageId: string,
): EngineMessage[] {
  return messages.map((message) =>
    message.id === assistantMessageId
      ? ({
          ...message,
          content: message.content.map(cancelAssistantMessagePart),
          status: { reason: "cancelled", type: "incomplete" },
        } as EngineMessage)
      : message,
  );
}

function cancelAssistantMessagePart(
  part: EngineMessage["content"][number],
): EngineMessage["content"][number] {
  if (
    part.type === "tool-call" &&
    isChatToolAction(part.artifact) &&
    !isTerminalChatToolPhase(part.artifact.phase)
  ) {
    return {
      ...part,
      artifact: {
        ...part.artifact,
        phase: "cancelled",
      },
    };
  }

  if (
    part.type === "data" &&
    part.name === "elicitation" &&
    isChatElicitationData(part.data) &&
    !isClosedElicitationPhase(part.data.phase)
  ) {
    return {
      ...part,
      data: {
        ...part.data,
        phase: "cancelled",
      },
    };
  }

  return part;
}
