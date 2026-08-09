import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  encodeClaudeProjectDir,
  encodePiSessionDir,
  listClaudeLocalSessions,
  listPiLocalSessions,
  mapNativeImportableResult,
} from "./importable-sessions";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.PI_HOME;
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("claude/pi importable session discovery", () => {
  it("encodes Pi cwd the way SessionManager does", () => {
    expect(encodePiSessionDir("/Users/akrc/Developer/angel-engine")).toBe(
      "--Users-akrc-Developer-angel-engine--",
    );
  });

  it("encodes Claude project dirs including dot segments", () => {
    expect(
      encodeClaudeProjectDir(
        "/Users/akrc/.2code/workspace/fengwu-bench-setup-hook-linter-31cc0288",
      ),
    ).toBe(
      "-Users-akrc--2code-workspace-fengwu-bench-setup-hook-linter-31cc0288",
    );
  });

  it("lists Claude sessions from the documented project store for a cwd", () => {
    const home = tempDir("claude-import-");
    process.env.CLAUDE_CONFIG_DIR = home;
    const cwd = "/Users/eric/work/demo";
    const projectDir = path.join(home, "projects", encodeClaudeProjectDir(cwd));
    fs.mkdirSync(projectDir, { recursive: true });
    const sessionPath = path.join(projectDir, "sess-claude-1.jsonl");
    fs.writeFileSync(
      sessionPath,
      `${JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "Hello Claude import" }] },
      })}\n`,
    );

    const sessions = listClaudeLocalSessions(cwd);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.remoteId).toBe("sess-claude-1");
    expect(sessions[0]?.title).toContain("Hello Claude import");
    expect(sessions[0]?.cwd).toBe(cwd);
    expect(sessions[0]?.updatedAt).toBeTruthy();
  });

  it("lists Pi sessions under the agent sessions root for a cwd", () => {
    const home = tempDir("pi-import-");
    process.env.PI_HOME = home;
    const cwd = "/repo/pi-demo";
    const sessionDir = path.join(
      home,
      "agent",
      "sessions",
      encodePiSessionDir(cwd),
    );
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(
      sessionDir,
      "2026-01-01T00-00-00-000Z_sess-1.jsonl",
    );
    fs.writeFileSync(
      sessionFile,
      `${JSON.stringify({ title: "Pi session title" })}\n`,
    );

    const sessions = listPiLocalSessions(cwd);
    expect(sessions).toHaveLength(1);
    // Pi resume uses the absolute session file path as remote id.
    expect(sessions[0]?.remoteId).toBe(sessionFile);
    expect(sessions[0]?.title).toBe("Pi session title");
  });

  it("maps native list results without inventing remote ids", () => {
    expect(
      mapNativeImportableResult({
        nextCursor: "next",
        sessions: [
          { remoteId: "t1", title: "One", cwd: "/repo" },
          { remoteId: "", title: "skip" },
        ],
        unsupportedReason: null,
      }),
    ).toEqual({
      nextCursor: "next",
      sessions: [
        { remoteId: "t1", title: "One", cwd: "/repo", updatedAt: null },
      ],
      unsupportedReason: null,
    });
  });
});
