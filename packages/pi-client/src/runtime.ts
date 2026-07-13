import type { SendTextRequest } from "@angel-engine/client-napi";
import type { PiSdkRpcClient, PiThinkingLevel } from "./types.js";

import is from "@sindresorhus/is";

type PiPromptImage =
  NonNullable<Parameters<PiSdkRpcClient["prompt"]>[1]> extends Array<
    infer Image
  >
    ? Image
    : never;

export const piThinkingLevelIds = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly PiThinkingLevel[];

export interface PiPrompt {
  images: PiPromptImage[];
  text: string;
}

export function piPrompt(
  text: string,
  input: NonNullable<SendTextRequest["input"]>,
): PiPrompt {
  const parts: string[] = [];
  const images: PiPromptImage[] = [];
  if (text) parts.push(text);

  for (const value of input) {
    switch (value.type) {
      case "text":
        if (value.text && value.text !== text) parts.push(value.text);
        break;
      case "image":
        if (!is.nonEmptyString(value.data)) {
          throw new Error("Pi image attachment is missing data.");
        }
        images.push({
          data: value.data,
          mimeType: value.mimeType,
          type: "image",
        } as PiPromptImage);
        break;
      case "file_mention": {
        const mentionPath = is.nonEmptyString(value.path)
          ? value.path
          : value.name;
        if (!is.nonEmptyString(mentionPath)) {
          throw new Error("File mention input is missing path or name.");
        }
        parts.push(`@${mentionPath}`);
        break;
      }
      case "skill_mention":
        if (!is.nonEmptyString(value.name)) {
          throw new Error("Skill mention input is missing name.");
        }
        parts.push(`/skill:${value.name}`);
        break;
      case "embedded_text_resource":
        parts.push(`Resource: ${value.uri}\n\n${value.text}`);
        break;
      case "resource_link":
        parts.push(`Resource: ${value.name} (${value.uri})`);
        break;
      case "embedded_blob_resource": {
        const label = is.string(value.name) ? value.name : value.uri;
        if (!is.string(label)) {
          throw new Error("Embedded blob resource is missing name or uri.");
        }
        throw new Error(
          `Attachment type "${value.mimeType}" is not supported by the Pi runtime: ${label}`,
        );
      }
      case "raw_content_block":
        throw new Error(
          "Raw content blocks are not supported by the Pi runtime.",
        );
    }
  }

  return {
    images,
    text: parts.join("\n\n"),
  };
}

export function piThinkingLevel(value: string): PiThinkingLevel {
  if ((piThinkingLevelIds as readonly string[]).includes(value)) {
    return value as PiThinkingLevel;
  }
  throw new Error(`Unsupported Pi thinking level: ${value}`);
}
