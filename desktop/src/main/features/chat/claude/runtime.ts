import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import type { SendTextRequest } from "@angel-engine/client-napi";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import { CLIENT_INPUT_TYPES, type ClientInput } from "../client-input";
import type { ClaudeSdkModule, JsonObject } from "./types";
import { asObject, isJsonObject, uniqueStrings } from "./utils";

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(__filename);

let claudeSdkPromise: Promise<ClaudeSdkModule> | undefined;
let claudePermissionModesPromise: Promise<string[]> | undefined;
let claudeEffortLevelsPromise: Promise<string[]> | undefined;

export function loadClaudeSdk(): Promise<ClaudeSdkModule> {
  claudeSdkPromise ??= import("@anthropic-ai/claude-agent-sdk");
  return claudeSdkPromise;
}

export function loadClaudePermissionModeIds(): Promise<string[]> {
  claudePermissionModesPromise ??= loadClaudeHelpChoices(
    "--permission-mode",
  ).then((modes) => modes.filter((mode) => mode !== "bypassPermissions"));
  return claudePermissionModesPromise;
}

export function loadClaudeEffortLevelIds(): Promise<string[]> {
  claudeEffortLevelsPromise ??= loadClaudeHelpChoices("--effort");
  return claudeEffortLevelsPromise;
}

async function loadClaudeHelpChoices(optionName: string): Promise<string[]> {
  const executable = resolveClaudeExecutable();
  if (!executable) return [];
  try {
    const { stdout } = await execFileAsync(executable, ["--help"], {
      maxBuffer: 512_000,
      timeout: 5_000,
    });
    return parseOptionChoices(String(stdout), optionName);
  } catch {
    return [];
  }
}

function resolveClaudeExecutable(): string | undefined {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const packages =
    process.platform === "linux"
      ? [
          `@anthropic-ai/claude-agent-sdk-linux-${process.arch}-musl/claude${suffix}`,
          `@anthropic-ai/claude-agent-sdk-linux-${process.arch}/claude${suffix}`,
        ]
      : [
          `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude${suffix}`,
        ];

  for (const packagePath of packages) {
    try {
      return nodeRequire.resolve(packagePath);
    } catch {
      continue;
    }
  }
  return undefined;
}

function parseOptionChoices(helpText: string, optionName: string): string[] {
  const line = helpText
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(optionName));
  if (!line) return [];
  const choices =
    line.match(/\(choices:\s*([^)]+)\)/)?.[1] ??
    line.match(/\(([^)]*)\)/)?.[1] ??
    "";
  if (!choices) return [];
  const quoted = Array.from(
    choices.matchAll(/"([^"]+)"/g),
    (match) => match[1],
  );
  if (quoted.length > 0) return uniqueStrings(quoted);
  return uniqueStrings(choices.split(","));
}

export async function* emptyClaudePrompt(): AsyncIterable<SDKUserMessage> {
  return;
}

export function claudePrompt(
  text: string,
  input: NonNullable<SendTextRequest["input"]>,
): string | AsyncIterable<SDKUserMessage> {
  const content = clientInputToContent(text, input);
  if (content.length === 1 && asObject(content[0])?.type === "text") {
    return String(asObject(content[0])?.text ?? "");
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
      case CLIENT_INPUT_TYPES.text: {
        const itemText = value.text;
        if (itemText && itemText !== text) {
          content.push({ text: itemText, type: "text" });
        }
        break;
      }
      case CLIENT_INPUT_TYPES.image:
        content.push({
          source: {
            data: value.data,
            media_type: value.mimeType,
            type: "base64",
          },
          type: "image",
        });
        break;
      case CLIENT_INPUT_TYPES.file_mention:
        content.push({
          text: `@${value.path || value.name}`,
          type: "text",
        });
        break;
      case CLIENT_INPUT_TYPES.embedded_text_resource:
        content.push({
          text: [`Resource: ${value.uri}`, value.text].join("\n\n"),
          type: "text",
        });
        break;
      case CLIENT_INPUT_TYPES.resource_link:
        content.push({
          text: `Resource: ${value.name} (${value.uri})`,
          type: "text",
        });
        break;
      case CLIENT_INPUT_TYPES.embedded_blob_resource:
        content.push({
          text: `Attachment: ${String(value.name ?? value.uri ?? "blob")}`,
          type: "text",
        });
        break;
      case CLIENT_INPUT_TYPES.raw_content_block:
        if (isJsonObject(value.value)) {
          content.push(value.value);
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
