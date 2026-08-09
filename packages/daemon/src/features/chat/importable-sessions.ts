import type {
  ImportableSession,
  ListImportableSessionsResult,
} from "@angel-engine/daemon-api/chat";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import is from "@sindresorhus/is";

/**
 * Claude Code project dir encoding under `~/.claude/projects/`:
 * absolute path with path separators and dots replaced by `-` so that
 * e.g. `/Users/akrc/.2code/workspace/foo` → `-Users-akrc--2code-workspace-foo`.
 */
export function encodeClaudeProjectDir(cwd: string): string {
  return path.resolve(cwd).replace(/[/\\.]/g, "-");
}

/**
 * Pi agent cwd encoding under `~/.pi/agent/sessions/`:
 * strip leading separator, replace path separators/`:` with `-`, wrap with `--`.
 * Example: `/Users/akrc/work` → `--Users-akrc-work--`
 * (matches `@earendil-works/pi-coding-agent` SessionManager)
 */
export function encodePiSessionDir(cwd: string): string {
  const resolved = path.resolve(cwd);
  const safe = resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
  return `--${safe}--`;
}

export function expandHome(input: string): string {
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

function readOptionalTitleFromJsonl(filePath: string): string | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    for (const line of lines.slice(0, 40)) {
      try {
        const value = JSON.parse(line) as {
          type?: string;
          message?: { content?: unknown };
          content?: unknown;
          title?: string;
          name?: string;
          summary?: string;
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

function byUpdatedAtDesc(a: ImportableSession, b: ImportableSession): number {
  const left = a.updatedAt ?? "";
  const right = b.updatedAt ?? "";
  return right.localeCompare(left);
}

/** List Claude Code sessions for a cwd from the documented local store. */
export function listClaudeLocalSessions(cwd: string): ImportableSession[] {
  const projectDir = path.join(
    claudeConfigDir(),
    "projects",
    encodeClaudeProjectDir(cwd),
  );
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return [];
  }

  const sessions: ImportableSession[] = [];
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
  return sessions.sort(byUpdatedAtDesc);
}

/**
 * List Pi sessions for a cwd. Remote id is the absolute session file path
 * (what Pi resume / `remoteId` expects).
 */
export function listPiLocalSessions(cwd: string): ImportableSession[] {
  const sessionDir = path.join(
    piAgentHome(),
    "agent",
    "sessions",
    encodePiSessionDir(cwd),
  );
  if (!fs.existsSync(sessionDir) || !fs.statSync(sessionDir).isDirectory()) {
    return [];
  }

  const sessions: ImportableSession[] = [];
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
  return sessions.sort(byUpdatedAtDesc);
}

export function emptyImportableResult(
  unsupportedReason?: string,
): ListImportableSessionsResult {
  return {
    nextCursor: null,
    sessions: [],
    unsupportedReason: unsupportedReason ?? null,
  };
}

/**
 * Map NAPI/camelCase list results into the daemon API shape.
 * Drops entries without a remote id — never invents one.
 */
export function mapNativeImportableResult(value: {
  nextCursor?: string | null;
  sessions?: Array<{
    cwd?: string | null;
    remoteId: string;
    title?: string | null;
    updatedAt?: string | null;
  }>;
  unsupportedReason?: string | null;
}): ListImportableSessionsResult {
  return {
    nextCursor: value.nextCursor ?? null,
    sessions: (value.sessions ?? [])
      .filter((session) => is.nonEmptyString(session.remoteId))
      .map((session) => ({
        cwd: session.cwd ?? null,
        remoteId: session.remoteId,
        title: session.title ?? null,
        updatedAt: session.updatedAt ?? null,
      })),
    unsupportedReason: value.unsupportedReason ?? null,
  };
}
