import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ConnectionError,
  defaultDaemonInfoPaths,
  resolveDaemonConnection,
} from "../connection";

const tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("resolveDaemonConnection", () => {
  it("prefers explicit flags over env", () => {
    const connection = resolveDaemonConnection(
      { token: "flag-token", url: "http://127.0.0.1:9/" },
      {
        ANGEL_DAEMON_TOKEN: "env-token",
        ANGEL_DAEMON_URL: "http://127.0.0.1:1",
      },
      "/tmp/home",
    );
    expect(connection).toEqual({
      source: "flags",
      token: "flag-token",
      url: "http://127.0.0.1:9",
    });
  });

  it("reads env when flags are absent", () => {
    const connection = resolveDaemonConnection(
      {},
      {
        ANGEL_DAEMON_TOKEN: "env-token",
        ANGEL_DAEMON_URL: "http://127.0.0.1:4242",
      },
      "/tmp/home",
    );
    expect(connection.source).toBe("env");
    expect(connection.url).toBe("http://127.0.0.1:4242");
    expect(connection.token).toBe("env-token");
  });

  it("loads daemon.json from --info", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "angelctl-info-"));
    tempDirs.push(dir);
    const infoPath = path.join(dir, "daemon.json");
    await writeFile(
      infoPath,
      JSON.stringify({
        host: "127.0.0.1",
        pid: 1,
        port: 5555,
        token: "file-token",
        version: "1.0.0",
      }),
      "utf8",
    );

    const connection = resolveDaemonConnection(
      { infoPath },
      {},
      "/tmp/missing-home",
    );
    expect(connection).toEqual({
      source: `info:${infoPath}`,
      token: "file-token",
      url: "http://127.0.0.1:5555",
    });
  });

  it("falls back to well-known home path", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "angelctl-home-"));
    tempDirs.push(home);
    const infoPath = path.join(home, ".angel-engine", "daemon.json");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(infoPath), { recursive: true });
    await writeFile(
      infoPath,
      `${JSON.stringify({
        host: "127.0.0.1",
        pid: 2,
        port: 6000,
        token: "home-token",
        version: "1.0.0",
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    const connection = resolveDaemonConnection({}, {}, home);
    expect(connection.token).toBe("home-token");
    expect(connection.url).toBe("http://127.0.0.1:6000");
    expect(connection.source).toBe(`file:${infoPath}`);
  });

  it("errors when nothing is configured", () => {
    expect(() =>
      resolveDaemonConnection(
        {},
        {},
        path.join(os.tmpdir(), "no-such-home-xyz"),
      ),
    ).toThrow(ConnectionError);
  });
});

describe("defaultDaemonInfoPaths", () => {
  it("always includes ~/.angel-engine/daemon.json", () => {
    const paths = defaultDaemonInfoPaths("/Users/test");
    expect(paths[0]).toBe("/Users/test/.angel-engine/daemon.json");
  });
});
