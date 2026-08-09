import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import is from "@sindresorhus/is";

/** Normalized importable Claude Code session (protocol-neutral metadata). */
export interface ImportableClaudeSession {
  cwd: string;
  remoteId: string;
  title?: string | null;
  updatedAt?: string | null;
}

/**
 * Claude Code project dir encoding under `~/.claude/projects/`:
 * absolute path with path separators and dots replaced by `-`.
 */
export function encodeClaudeProjectDir(cwd: string): string {
  return path.resolve(cwd).replace(/[/\\.]/g, "-");
}

function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function claudeConfigDir(): string {
  const fromEnv = process.env.CLAUDE_CONFIG_DIR;
  if (is.nonEmptyString(fromEnv)) return expandHome(fromEnv);
  return path.join(os.homedir(), ".claude");
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
            message?: { content?: unknown };
            name?: string;
            summary?: string;
            title?: string;
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
 * List Claude Code sessions for a cwd from the documented local store.
 * Remote id is the session UUID (JSONL basename without extension).
 */
export function listImportableClaudeSessions(
  cwd: string,
): ImportableClaudeSession[] {
  const projectDir = path.join(
    claudeConfigDir(),
    "projects",
    encodeClaudeProjectDir(cwd),
  );
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return [];
  }

  const sessions: ImportableClaudeSession[] = [];
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const remoteId = entry.name.replace(/\.jsonl$/i, "");
    if (!is.nonEmptyString(remoteId)) continue;
    const filePath = path.join(projectDir, entry.name);
    sessions.push({
      cwd,
      remoteId,
      title: readOptionalTitleFromJsonl(filePath),
      updatedAt: safeStatMtimeIso(filePath),
    });
  }
  return sessions.sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
}
