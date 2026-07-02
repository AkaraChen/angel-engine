import type { SendTextRequest } from "@angel-engine/client-napi";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ChatJsonObject } from "@angel-engine/js-client";
export { loadClaudeSdk } from "./sdk-loader.js";
import is from "@sindresorhus/is";
import { claudeEffortLevelIds, claudePermissionModeIds } from "./utils.js";

type ClientInput = NonNullable<SendTextRequest["input"]>[number];

let claudePermissionModesPromise: Promise<string[]> | undefined;
let claudeEffortLevelsPromise: Promise<string[]> | undefined;

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
): ChatJsonObject[] {
  const content: ChatJsonObject[] = [];
  if (text) content.push({ text, type: "text" });
  for (const value of input) {
    switch (value.type) {
      case "text": {
        const itemText = value.text;
        if (itemText && itemText !== text) {
          content.push({ text: itemText, type: "text" });
        }
        break;
      }
      case "image":
        content.push({
          source: {
            data: value.data,
            media_type: value.mimeType,
            type: "base64",
          },
          type: "image",
        });
        break;
      case "file_mention":
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
      case "embedded_text_resource":
        content.push({
          text: [`Resource: ${value.uri}`, value.text].join("\n\n"),
          type: "text",
        });
        break;
      case "resource_link":
        content.push({
          text: `Resource: ${value.name} (${value.uri})`,
          type: "text",
        });
        break;
      case "embedded_blob_resource": {
        const label = is.string(value.name) ? value.name : value.uri;
        if (!is.string(label)) {
          throw new Error("Embedded blob resource is missing name or uri.");
        }
        if (value.mimeType === "application/pdf") {
          if (!is.nonEmptyString(value.data)) {
            throw new Error("PDF attachment is missing data.");
          }
          content.push({
            source: {
              data: value.data,
              media_type: "application/pdf",
              type: "base64",
            },
            title: label,
            type: "document",
          });
          break;
        }
        throw new Error(
          `Attachment type "${value.mimeType}" is not supported by the Claude runtime: ${label}`,
        );
      }
      case "raw_content_block":
        if (!is.plainObject(value.value)) {
          throw new Error("Raw content block input must be an object.");
        }
        content.push(value.value as ChatJsonObject);
        break;
    }
  }
  return content;
}
