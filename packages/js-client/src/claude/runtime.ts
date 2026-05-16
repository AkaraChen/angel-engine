import type { SendTextRequest } from "@angel-engine/client-napi";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeSdkModule, JsonObject } from "./types.js";
import { ClientInputType } from "@angel-engine/client-napi";
import { claudeEffortLevelIds, claudePermissionModeIds } from "./utils.js";

type ClientInput = NonNullable<SendTextRequest["input"]>[number];

let claudeSdkPromise: Promise<ClaudeSdkModule> | undefined;
let claudePermissionModesPromise: Promise<string[]> | undefined;
let claudeEffortLevelsPromise: Promise<string[]> | undefined;

export async function loadClaudeSdk(): Promise<ClaudeSdkModule> {
  claudeSdkPromise ??= import("@anthropic-ai/claude-agent-sdk");
  return claudeSdkPromise;
}

export async function loadClaudePermissionModeIds(): Promise<string[]> {
  claudePermissionModesPromise ??= Promise.resolve(claudePermissionModeIds());
  return claudePermissionModesPromise;
}

export async function loadClaudeEffortLevelIds(): Promise<string[]> {
  claudeEffortLevelsPromise ??= Promise.resolve(claudeEffortLevelIds());
  return claudeEffortLevelsPromise;
}

export async function* emptyClaudePrompt(): AsyncIterable<SDKUserMessage> {}

export function claudePrompt(
  text: string,
  input: NonNullable<SendTextRequest["input"]>,
): string | AsyncIterable<SDKUserMessage> {
  const content = clientInputToContent(text, input);
  const singleContent = content[0];
  if (content.length === 1 && singleContent?.type === "text") {
    return String(singleContent.text ?? "");
  }

  return (async function* (): AsyncIterable<SDKUserMessage> {
    yield {
      message: {
        content: content as unknown as SDKUserMessage["message"]["content"],
        role: "user",
      },
      parent_tool_use_id: null,
      type: "user",
    };
  })();
}

function clientInputToContent(
  text: string,
  input: ClientInput[],
): JsonObject[] {
  const content: JsonObject[] = [];
  if (text) content.push({ text, type: "text" });
  for (const value of input) {
    switch (value.type) {
      case ClientInputType.Text: {
        const itemText = value.text;
        if (itemText && itemText !== text) {
          content.push({ text: itemText, type: "text" });
        }
        break;
      }
      case ClientInputType.Image:
        content.push({
          source: {
            data: value.data,
            media_type: value.mimeType,
            type: "base64",
          },
          type: "image",
        });
        break;
      case ClientInputType.FileMention:
        content.push({
          text: `@${value.path || value.name}`,
          type: "text",
        });
        break;
      case ClientInputType.EmbeddedTextResource:
        content.push({
          text: [`Resource: ${value.uri}`, value.text].join("\n\n"),
          type: "text",
        });
        break;
      case ClientInputType.ResourceLink:
        content.push({
          text: `Resource: ${value.name} (${value.uri})`,
          type: "text",
        });
        break;
      case ClientInputType.EmbeddedBlobResource:
        content.push({
          text: `Attachment: ${String(value.name ?? value.uri ?? "blob")}`,
          type: "text",
        });
        break;
      case ClientInputType.RawContentBlock:
        if (
          value.value &&
          typeof value.value === "object" &&
          !Array.isArray(value.value)
        ) {
          content.push(value.value as JsonObject);
        }
        break;
      default: {
        const exhaustive: never = value;
        throw new Error(
          `Unsupported client input type: ${JSON.stringify(exhaustive)}`,
        );
      }
    }
  }
  return content;
}
