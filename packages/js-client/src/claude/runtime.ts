import type { SendTextRequest } from "@angel-engine/client-napi";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeSdkModule, JsonObject } from "./types.js";
import { ClientInputType } from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
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
    if (!is.string(singleContent.text)) {
      throw new Error("Claude text content is missing text.");
    }
    return singleContent.text;
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
        const mentionPath = is.nonEmptyString(value.path)
          ? value.path
          : value.name;
        if (!is.nonEmptyString(mentionPath)) {
          throw new Error("File mention input is missing path or name.");
        }
        content.push({
          text: `@${mentionPath}`,
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
        const label = is.string(value.name) ? value.name : value.uri;
        if (!is.string(label)) {
          throw new Error("Embedded blob resource is missing name or uri.");
        }
        content.push({
          text: `Attachment: ${label}`,
          type: "text",
        });
        break;
      case ClientInputType.RawContentBlock:
        if (!is.plainObject(value.value)) {
          throw new Error("Raw content block input must be an object.");
        }
        content.push(value.value as JsonObject);
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
