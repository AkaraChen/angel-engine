import { describe, expect, it, vi } from "vitest";

import { parseArgv, runCli } from "../cli";
import { ExitCode } from "../exit";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("parseArgv", () => {
  it("parses global flags and nested commands", () => {
    const parsed = parseArgv([
      "--json",
      "--url",
      "http://127.0.0.1:1",
      "--token",
      "secret",
      "chat",
      "get",
      "chat-1",
    ]);
    expect(parsed.output.json).toBe(true);
    expect(parsed.connection.url).toBe("http://127.0.0.1:1");
    expect(parsed.connection.token).toBe("secret");
    expect(parsed.command).toEqual(["chat", "get"]);
    expect(parsed.args).toEqual(["chat-1"]);
  });
});

describe("runCli", () => {
  it("prints help without contacting the daemon", async () => {
    let stdout = "";
    const code = await runCli(["--help"], {
      stdout: {
        write(chunk: string) {
          stdout += chunk;
          return true;
        },
      } as NodeJS.WritableStream,
    });
    expect(code).toBe(ExitCode.success);
    expect(stdout).toContain("angelctl");
    expect(stdout).toContain("health");
  });

  it("runs health with mocked fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ pid: 1, uptime: 2, version: "1.2.3" }));
    let stdout = "";
    const code = await runCli(
      ["--url", "http://127.0.0.1:9", "--token", "t", "--json", "health"],
      {
        fetchImpl: fetchMock as unknown as typeof fetch,
        stdout: {
          write(chunk: string) {
            stdout += chunk;
            return true;
          },
        } as NodeJS.WritableStream,
      },
    );
    expect(code).toBe(ExitCode.success);
    expect(JSON.parse(stdout)).toEqual({
      pid: 1,
      uptime: 2,
      version: "1.2.3",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9/api/health",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit)
      .headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer t");
  });

  it("maps 401 to auth exit code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));
    let stderr = "";
    const code = await runCli(
      ["--url", "http://127.0.0.1:9", "--token", "bad", "health"],
      {
        fetchImpl: fetchMock as unknown as typeof fetch,
        stderr: {
          write(chunk: string) {
            stderr += chunk;
            return true;
          },
        } as NodeJS.WritableStream,
        stdout: { write: () => true } as unknown as NodeJS.WritableStream,
      },
    );
    expect(code).toBe(ExitCode.auth);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it("lists chats via daemon-client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          archived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          cwd: null,
          id: "c1",
          pinned: false,
          projectId: null,
          remoteThreadId: null,
          runtime: "claude",
          title: "One",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );
    let stdout = "";
    const code = await runCli(
      ["--url", "http://127.0.0.1:9", "--token", "t", "--quiet", "chat", "ls"],
      {
        fetchImpl: fetchMock as unknown as typeof fetch,
        stdout: {
          write(chunk: string) {
            stdout += chunk;
            return true;
          },
        } as NodeJS.WritableStream,
      },
    );
    expect(code).toBe(ExitCode.success);
    expect(stdout.trim()).toBe("c1");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:9/api/chats");
  });

  it("redacts token in which output", async () => {
    let stdout = "";
    const code = await runCli(
      [
        "--url",
        "http://127.0.0.1:9",
        "--token",
        "super-secret",
        "--json",
        "which",
      ],
      {
        stdout: {
          write(chunk: string) {
            stdout += chunk;
            return true;
          },
        } as NodeJS.WritableStream,
      },
    );
    expect(code).toBe(ExitCode.success);
    expect(stdout).not.toContain("super-secret");
    expect(JSON.parse(stdout).token).toBe("[redacted]");
    expect(JSON.parse(stdout).url).toBe("http://127.0.0.1:9");
  });

  it("lists skills for a runtime (skill visibility path)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          description: "Control the local host via angelctl",
          name: "angel-host",
          path: "/tmp/angel-host",
          scope: "system",
        },
      ]),
    );
    let stdout = "";
    const code = await runCli(
      [
        "--url",
        "http://127.0.0.1:9",
        "--token",
        "t",
        "--json",
        "skill",
        "ls",
        "--runtime",
        "claude",
      ],
      {
        fetchImpl: fetchMock as unknown as typeof fetch,
        stdout: {
          write(chunk: string) {
            stdout += chunk;
            return true;
          },
        } as NodeJS.WritableStream,
      },
    );
    expect(code).toBe(ExitCode.success);
    const body = JSON.parse(stdout) as Array<{ name: string }>;
    expect(body.some((skill) => skill.name === "angel-host")).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/agents/skills",
    );
  });

  it("sends a chat message (write path, mocked daemon)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        chatId: "c1",
        runId: "r1",
      }),
    );
    let stdout = "";
    const code = await runCli(
      [
        "--url",
        "http://127.0.0.1:9",
        "--token",
        "t",
        "--json",
        "chat",
        "send",
        "c1",
        "hello from agent",
      ],
      {
        fetchImpl: fetchMock as unknown as typeof fetch,
        stdout: {
          write(chunk: string) {
            stdout += chunk;
            return true;
          },
        } as NodeJS.WritableStream,
      },
    );
    expect(code).toBe(ExitCode.success);
    expect(JSON.parse(stdout)).toEqual({ chatId: "c1", runId: "r1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:9/api/chats/send",
    );
  });
});
