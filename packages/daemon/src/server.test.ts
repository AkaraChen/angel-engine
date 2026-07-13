import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDaemon, type Daemon } from "./index";

const daemons: Daemon[] = [];

afterEach(async () => {
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
});
