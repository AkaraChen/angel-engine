import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createDaemon, type Daemon } from "./index";

const daemons: Daemon[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  await Promise.all(daemons.splice(0).map((daemon) => daemon.close()));
});

describe("createDaemon", () => {
  it("protects health and shutdown with the handshake token", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const daemon = await createDaemon({
      dataDir,
      token: "secret",
      version: "test",
    });
    daemons.push(daemon);
    const baseUrl = `http://${daemon.info.host}:${daemon.info.port}`;

    expect((await fetch(`${baseUrl}/api/health`)).status).toBe(401);
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ version: "test" });

    const persisted = JSON.parse(
      await readFile(path.join(dataDir, "daemon.json"), "utf8"),
    );
    expect(persisted).toEqual(daemon.info);
    if (process.platform !== "win32") {
      expect((await stat(path.join(dataDir, "daemon.json"))).mode & 0o777).toBe(
        0o600,
      );
    }
  });

  it("allows renderer preflight before bearer authentication", async () => {
    const daemon = await startDaemon();
    const response = await fetch(
      `http://${daemon.info.host}:${daemon.info.port}/api/process-registry`,
      {
        headers: {
          "access-control-request-headers": "authorization,content-type",
          "access-control-request-method": "GET",
          origin: "file://",
        },
        method: "OPTIONS",
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );
  });

  it("acknowledges shutdown before invoking the process callback", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    let resolveShutdown: (() => void) | undefined;
    const shutdown = new Promise<void>((resolve) => {
      resolveShutdown = resolve;
    });
    const daemon = await createDaemon({
      dataDir,
      onShutdown: () => resolveShutdown?.(),
      token: "secret",
    });
    daemons.push(daemon);

    const response = await fetch(
      `http://${daemon.info.host}:${daemon.info.port}/api/shutdown`,
      {
        headers: { authorization: "Bearer secret" },
        method: "POST",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await shutdown;
  });

  it("replaces and enumerates the authenticated process registry", async () => {
    const daemon = await startDaemon();
    const response = await daemonFetch(daemon, "/api/process-registry", {
      body: JSON.stringify({
        entries: [{ id: "chat-1", label: "Codex", rootPid: process.pid }],
      }),
      method: "PUT",
    });
    expect(response.status).toBe(200);

    const snapshot = await daemonFetch(daemon, "/api/process-registry");
    expect(snapshot.status).toBe(200);
    await expect(snapshot.json()).resolves.toMatchObject({
      entries: [{ id: "chat-1", label: "Codex", rootPid: process.pid }],
    });
  });

  it("rejects killing an unregistered process", async () => {
    const daemon = await startDaemon();
    const response = await daemonFetch(daemon, "/api/processes/1/kill", {
      method: "POST",
    });
    expect(response.status).toBe(403);
  });

  it("kills a current descendant of a registered root", async () => {
    const daemon = await startDaemon();
    const child = spawnSleep();
    children.push(child);
    await daemonFetch(daemon, "/api/process-registry", {
      body: JSON.stringify({
        entries: [{ id: "chat-1", label: "Test", rootPid: process.pid }],
      }),
      method: "PUT",
    });

    const exited = new Promise<void>((resolve) => child.once("exit", resolve));
    const response = await daemonFetch(
      daemon,
      `/api/processes/${child.pid}/kill`,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    await exited;
  });

  it.skipIf(process.platform === "win32")(
    "runs terminal sessions over authenticated WebSocket",
    async () => {
      const daemon = await startDaemon();
      const socket = new WebSocket(
        `ws://${daemon.info.host}:${daemon.info.port}/api/terminals`,
        `angel-engine-token.${daemon.info.token}`,
      );
      const marker = `daemon-terminal-${Date.now()}`;
      const output = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Terminal output timed out.")),
          5_000,
        );
        socket.on("message", (raw) => {
          const message = JSON.parse(raw.toString()) as {
            event?: { data?: string };
          };
          if (message.event?.data?.includes(marker)) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      await new Promise<void>((resolve) => socket.once("open", resolve));
      socket.send(
        JSON.stringify({
          cols: 80,
          cwd: os.tmpdir(),
          rows: 24,
          sessionId: "terminal-1",
          type: "create",
        }),
      );
      socket.send(
        JSON.stringify({
          data: `printf '${marker}\\n'\n`,
          sessionId: "terminal-1",
          type: "write",
        }),
      );
      await output;
      socket.send(JSON.stringify({ sessionId: "terminal-1", type: "kill" }));
      socket.close();
    },
  );
});

async function startDaemon() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
  const daemon = await createDaemon({ dataDir, token: "secret" });
  daemons.push(daemon);
  return daemon;
}

function daemonFetch(daemon: Daemon, pathname: string, init?: RequestInit) {
  return fetch(`http://${daemon.info.host}:${daemon.info.port}${pathname}`, {
    ...init,
    headers: { authorization: "Bearer secret", ...init?.headers },
  });
}

function spawnSleep() {
  return process.platform === "win32"
    ? spawn("powershell", ["-NoProfile", "-Command", "Start-Sleep -Seconds 30"])
    : spawn("sleep", ["30"]);
}
