import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  encodePiSessionDir,
  listImportablePiSessions,
} from "../importable-sessions";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
  delete process.env.PI_HOME;
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("listImportablePiSessions", () => {
  it("encodes cwd the way SessionManager does", () => {
    expect(encodePiSessionDir("/Users/akrc/Developer/angel-engine")).toBe(
      "--Users-akrc-Developer-angel-engine--",
    );
  });

  it("lists sessions from the documented Pi sessions root", () => {
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

    const sessions = listImportablePiSessions(cwd);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.remoteId).toBe(sessionFile);
    expect(sessions[0]?.title).toBe("Pi session title");
  });
});
