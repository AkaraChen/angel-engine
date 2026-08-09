import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  encodeClaudeProjectDir,
  listImportableClaudeSessions,
} from "../importable-sessions";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
  delete process.env.CLAUDE_CONFIG_DIR;
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("listImportableClaudeSessions", () => {
  it("encodes project dirs including dot segments", () => {
    expect(
      encodeClaudeProjectDir(
        "/Users/akrc/.2code/workspace/fengwu-bench-setup-hook-linter-31cc0288",
      ),
    ).toBe(
      "-Users-akrc--2code-workspace-fengwu-bench-setup-hook-linter-31cc0288",
    );
  });

  it("lists sessions from the documented Claude project store", () => {
    const home = tempDir("claude-import-");
    process.env.CLAUDE_CONFIG_DIR = home;
    const cwd = "/Users/eric/work/demo";
    const projectDir = path.join(home, "projects", encodeClaudeProjectDir(cwd));
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "sess-claude-1.jsonl"),
      `${JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "Hello Claude import" }] },
      })}\n`,
    );

    const sessions = listImportableClaudeSessions(cwd);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.remoteId).toBe("sess-claude-1");
    expect(sessions[0]?.title).toContain("Hello Claude import");
  });
});
