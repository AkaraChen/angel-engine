import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scriptCommand, SpawnLifecycleProcessAdapter } from "./lifecycle";

describe("lifecycle process adapter", () => {
  let cwd: string;
  const adapter = new SpawnLifecycleProcessAdapter();

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "angel-process-adapter-"));
  });

  afterEach(async () => {
    await fs.rm(cwd, { force: true, recursive: true });
  });

  it("forwards output and resolves the session exit", async () => {
    const output: string[] = [];
    const session = await adapter.start({
      cwd,
      killGraceMs: 20,
      onOutput: async (chunk) => {
        output.push(chunk);
      },
      script:
        "node -e \"process.stdout.write('\\u001b[31mstdout\\u001b[0m');process.stderr.write('stderr')\"",
    });

    await expect(session.completion).resolves.toEqual({
      exitCode: 0,
      signal: null,
    });
    expect(output.join("")).toContain("\u001b[31m");
    expect(output.join("")).toContain("stdout");
    expect(output.join("")).toContain("stderr");
  });

  it("observes an already-aborted signal without a listener race", async () => {
    const controller = new AbortController();
    controller.abort();
    const session = await adapter.start({
      cwd,
      killGraceMs: 20,
      onOutput: async () => undefined,
      script: 'node -e "setInterval(() => undefined, 1000)"',
      signal: controller.signal,
    });

    await expect(session.completion).rejects.toMatchObject({
      failure: { reason: "cancelled" },
    });
  });

  it("uses the same cancellation path when a session is stopped", async () => {
    const session = await adapter.start({
      cwd,
      killGraceMs: 20,
      onOutput: async () => undefined,
      script: 'node -e "setInterval(() => undefined, 1000)"',
    });

    await session.stop();

    await expect(session.completion).rejects.toMatchObject({
      failure: { reason: "cancelled" },
    });
  });

  it("prefers bundled brush on Windows", async () => {
    const brush = path.join(cwd, "brush.exe");
    await fs.writeFile(brush, "fixture");

    await expect(
      scriptCommand("echo ready", "auto", "win32", {
        ANGEL_BRUSH_PATH: brush,
      }),
    ).resolves.toEqual([brush, ["-c", "echo ready"]]);
  });

  it("uses PowerShell only for explicit system compatibility", async () => {
    await expect(
      scriptCommand("Write-Output ready", "system", "win32", {}),
    ).resolves.toEqual([
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Write-Output ready",
      ],
    ]);
  });

  it("falls back to Git Bash when bundled brush is unavailable", async () => {
    const programFiles = path.join(cwd, "Program Files");
    const gitBash = path.join(programFiles, "Git", "bin", "bash.exe");
    await fs.mkdir(path.dirname(gitBash), { recursive: true });
    await fs.writeFile(gitBash, "fixture");

    await expect(
      scriptCommand("echo ready", "bash", "win32", {
        ProgramFiles: programFiles,
      }),
    ).resolves.toEqual([gitBash, ["-c", "echo ready"]]);
  });

  it("fails instead of silently executing bash syntax with PowerShell", async () => {
    await expect(
      scriptCommand("echo ready", "auto", "win32", {}),
    ).rejects.toThrow("No bash-compatible lifecycle shell");
  });
});
