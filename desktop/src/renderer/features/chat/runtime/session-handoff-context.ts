import type { Chat, ChatHistoryMessage } from "@angel-engine/daemon-api/chat";
import is from "@sindresorhus/is";

/** Max user/assistant turns kept in the handoff summary. */
const DEFAULT_MAX_TURNS = 12;
/** Max characters kept per message body. */
const DEFAULT_MAX_CHARS_PER_MESSAGE = 1_200;
/** Cap on extracted key-file paths. */
const DEFAULT_MAX_KEY_FILES = 24;

const PATH_ARG_KEYS = [
  "path",
  "file",
  "file_path",
  "filePath",
  "target_file",
  "targetFile",
  "filename",
  "fileName",
] as const;

export interface SessionHandoffDirtyStatus {
  branch?: string;
  isDirty: boolean;
}

export interface SessionHandoffContextPackInput {
  dirtyStatus?: SessionHandoffDirtyStatus | null;
  maxCharsPerMessage?: number;
  maxKeyFiles?: number;
  maxTurns?: number;
  messages: ChatHistoryMessage[];
  notes?: string;
  sourceChat: Pick<Chat, "cwd" | "id" | "runtime" | "title">;
  targetRuntime: string;
}

export interface SessionHandoffContextPack {
  dirtyWarning: string | null;
  keyFiles: string[];
  prompt: string;
  summaryTurns: Array<{ role: "assistant" | "user"; text: string }>;
}

/**
 * Build a portable context pack for a new session that continues work from
 * `sourceChat`. The original chat is never mutated — callers keep it visible.
 */
export function buildSessionHandoffContextPack(
  input: SessionHandoffContextPackInput,
): SessionHandoffContextPack {
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxChars = input.maxCharsPerMessage ?? DEFAULT_MAX_CHARS_PER_MESSAGE;
  const maxKeyFiles = input.maxKeyFiles ?? DEFAULT_MAX_KEY_FILES;

  const summaryTurns = summarizeConversation(
    input.messages,
    maxTurns,
    maxChars,
  );
  const keyFiles = extractKeyFiles(input.messages, maxKeyFiles);
  const notes = is.nonEmptyString(input.notes) ? input.notes.trim() : "";
  const dirtyWarning = formatDirtyWarning(input.dirtyStatus);
  const sameAgent = input.sourceChat.runtime === input.targetRuntime;

  const sections: string[] = [
    "# Session handoff",
    "",
    "Continue this task in the same workspace. The previous session remains available in the chat list.",
    "",
    "## Source",
    `- Title: ${input.sourceChat.title || "(untitled)"}`,
    `- Source chat id: \`${input.sourceChat.id}\``,
    `- From agent: \`${input.sourceChat.runtime}\``,
    `- To agent: \`${input.targetRuntime}\`${sameAgent ? " (same agent)" : ""}`,
  ];

  if (is.nonEmptyString(input.sourceChat.cwd)) {
    sections.push(`- Workspace: \`${input.sourceChat.cwd}\``);
  }

  if (dirtyWarning) {
    sections.push("", "## Working tree", dirtyWarning);
  }

  if (notes) {
    sections.push("", "## User notes", notes);
  }

  if (summaryTurns.length > 0) {
    sections.push("", "## Conversation summary");
    for (const turn of summaryTurns) {
      sections.push(
        "",
        `### ${turn.role === "user" ? "User" : "Assistant"}`,
        turn.text,
      );
    }
  } else {
    sections.push(
      "",
      "## Conversation summary",
      "(No prior user/assistant text was available; rely on notes and key files.)",
    );
  }

  if (keyFiles.length > 0) {
    sections.push("", "## Key files");
    for (const path of keyFiles) {
      sections.push(`- \`${path}\``);
    }
  }

  sections.push(
    "",
    "## Next step",
    "Pick up the work above. Prefer the workspace files and user notes over re-deriving context from scratch.",
  );

  return {
    dirtyWarning,
    keyFiles,
    prompt: sections.join("\n"),
    summaryTurns,
  };
}

export function summarizeConversation(
  messages: ChatHistoryMessage[],
  maxTurns = DEFAULT_MAX_TURNS,
  maxCharsPerMessage = DEFAULT_MAX_CHARS_PER_MESSAGE,
): Array<{ role: "assistant" | "user"; text: string }> {
  const turns: Array<{ role: "assistant" | "user"; text: string }> = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = messageText(message).trim();
    if (!text) continue;
    turns.push({
      role: message.role,
      text: truncate(text, maxCharsPerMessage),
    });
  }
  if (turns.length <= maxTurns) return turns;
  return turns.slice(turns.length - maxTurns);
}

export function extractKeyFiles(
  messages: ChatHistoryMessage[],
  maxFiles = DEFAULT_MAX_KEY_FILES,
): string[] {
  const seen = new Set<string>();
  const files: string[] = [];

  const add = (value: string | null | undefined) => {
    if (!is.nonEmptyString(value)) return;
    const path = value.trim();
    if (!path || seen.has(path)) return;
    seen.add(path);
    files.push(path);
  };

  for (const message of messages) {
    for (const part of message.content) {
      if (part.type === "file" || part.type === "image") {
        if ("path" in part) add(part.path);
        if ("filename" in part && is.nonEmptyString(part.filename)) {
          add(part.filename);
        }
        continue;
      }
      if (part.type !== "tool-call") continue;
      collectPathsFromJson(part.args, add);
      if (is.nonEmptyString(part.argsText)) {
        collectPathsFromArgsText(part.argsText, add);
      }
    }
  }

  return files.slice(0, maxFiles);
}

function messageText(message: ChatHistoryMessage): string {
  return message.content
    .filter(
      (part): part is { text: string; type: "text" } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function formatDirtyWarning(
  status: SessionHandoffDirtyStatus | null | undefined,
): string | null {
  if (!status?.isDirty) return null;
  const branch = is.nonEmptyString(status.branch)
    ? ` on branch \`${status.branch}\``
    : "";
  return `⚠️ Working tree is dirty${branch}. Uncommitted changes stay in this workspace for the new session — review them before continuing.`;
}

function collectPathsFromJson(
  value: unknown,
  add: (value: string | null | undefined) => void,
  depth = 0,
): void {
  if (depth > 4 || value == null) return;
  if (is.string(value)) {
    if (looksLikePath(value)) add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathsFromJson(item, add, depth + 1);
    return;
  }
  if (!is.plainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (
      (PATH_ARG_KEYS as readonly string[]).includes(key) &&
      is.string(child)
    ) {
      add(child);
      continue;
    }
    collectPathsFromJson(child, add, depth + 1);
  }
}

function collectPathsFromArgsText(
  argsText: string,
  add: (value: string | null | undefined) => void,
): void {
  try {
    const parsed: unknown = JSON.parse(argsText);
    collectPathsFromJson(parsed, add);
  } catch {
    // Ignore non-JSON tool args; structured args already cover the main path.
  }
}

function looksLikePath(value: string): boolean {
  if (value.length < 2 || value.length > 512) return false;
  if (value.includes("\n") || value.includes(" ")) return false;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes("/")
  );
}
