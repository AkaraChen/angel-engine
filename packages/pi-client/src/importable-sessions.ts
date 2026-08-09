import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import is from "@sindresorhus/is";

/** Normalized importable Pi session (protocol-neutral metadata). */
export interface ImportablePiSession {
  cwd: string;
  remoteId: string;
  title?: string | null;
  updatedAt?: string | null;
}

/**
 * Pi agent cwd encoding under `~/.pi/agent/sessions/`:
 * strip leading separator, replace path separators/`:` with `-`, wrap with `--`.
 */
export function encodePiSessionDir(cwd: string): string {
  const resolved = path.resolve(cwd);
  const safe = resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
  return `--${safe}--`;
}

function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function piAgentHome(): string {
  const fromEnv = process.env.PI_HOME ?? process.env.PI_AGENT_HOME;
  if (is.nonEmptyString(fromEnv)) return expandHome(fromEnv);
  return path.join(os.homedir(), ".pi");
}

function safeStatMtimeIso(filePath: string): string | undefined {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return undefined;
  }
}

/** Read only a bounded prefix of a JSONL transcript for list metadata. */
function readOptionalTitleFromJsonl(filePath: string): string | undefined {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(16 * 1024);
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const content = buffer.subarray(0, bytesRead).toString("utf8");
      const lines = content
        .split("\n")
        .filter((line) => line.trim().length > 0);
      for (const line of lines.slice(0, 40)) {
        try {
          const value = JSON.parse(line) as {
            content?: unknown;
            message?: { content?: unknown; role?: string };
            name?: string;
            summary?: string;
            title?: string;
            type?: string;
          };
          if (is.nonEmptyString(value.title)) return value.title;
          if (is.nonEmptyString(value.name)) return value.name;
          if (is.nonEmptyString(value.summary)) return value.summary;
          const text = extractText(value.message?.content ?? value.content);
          if (is.nonEmptyString(text)) return text.slice(0, 120);
        } catch {
          // skip malformed lines
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // unreadable
  }
  return undefined;
}

function extractText(content: unknown): string | undefined {
  if (typeof content === "string" && content.trim()) return content.trim();
  if (!Array.isArray(content)) return undefined;
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      "text" in part &&
      typeof (part as { text: unknown }).text === "string"
    ) {
      const text = (part as { text: string }).text.trim();
      if (text) return text;
    }
  }
  return undefined;
}

/**
 * List Pi sessions for a cwd from the documented local store.
 * Remote id is the absolute session file path (resume expects a path).
 */
export function listImportablePiSessions(cwd: string): ImportablePiSession[] {
  const sessionDir = path.join(
    piAgentHome(),
    "agent",
    "sessions",
    encodePiSessionDir(cwd),
  );
  if (!fs.existsSync(sessionDir) || !fs.statSync(sessionDir).isDirectory()) {
    return [];
  }

  const sessions: ImportablePiSession[] = [];
  for (const entry of fs.readdirSync(sessionDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const filePath = path.join(sessionDir, entry.name);
    sessions.push({
      cwd,
      remoteId: filePath,
      title: readOptionalTitleFromJsonl(filePath),
      updatedAt: safeStatMtimeIso(filePath),
    });
  }
  return sessions.sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
}
