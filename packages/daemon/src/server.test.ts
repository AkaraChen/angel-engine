import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createDaemon, type Daemon } from "./index";

const daemons: Daemon[] = [];
const children: ChildProcess[] = [];
const mobileDevServers: Array<{ http: Server; webSockets: WebSocketServer }> =
  [];

afterEach(async () => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  await Promise.all(daemons.splice(0).map((daemon) => daemon.close()));
  await Promise.all(
    mobileDevServers.splice(0).map(async ({ http, webSockets }) => {
      for (const socket of webSockets.clients) socket.terminate();
      webSockets.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }),
  );
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

  it("returns the resolved available-agent catalog", async () => {
    const daemon = await startDaemon();

    const response = await daemonFetch(daemon, "/api/agents");

    expect(response.status).toBe(200);
    expect(await response.json()).toBeInstanceOf(Array);
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

  it("serves the mobile bundle without leaking a token, behind pairing", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const mobileDir = path.join(dataDir, "mobile");
    await mkdir(path.join(mobileDir, "assets"), { recursive: true });
    await writeFile(
      path.join(mobileDir, "index.html"),
      "<!doctype html><head></head><body>hi</body>",
    );
    await writeFile(
      path.join(mobileDir, "assets", "app.js"),
      "console.log('app')",
    );

    const daemon = await createDaemon({
      dataDir,
      mobileDir,
      mobilePassword: "correct horse battery staple",
      serveMobile: true,
      token: "secret",
      version: "test",
    });
    daemons.push(daemon);
    const baseUrl = `http://${daemon.info.host}:${daemon.info.port}`;

    // Root serves index.html that signals auth is required but carries NO token.
    const root = await fetch(`${baseUrl}/`);
    expect(root.status).toBe(200);
    const rootHtml = await root.text();
    expect(rootHtml).toContain('window.__ANGEL_DAEMON__={"requiresAuth":true}');
    expect(rootHtml).not.toContain("secret");

    // Real assets are served with a sensible content type, no token injection.
    const asset = await fetch(`${baseUrl}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(await asset.text()).toBe("console.log('app')");

    // Deep client-routes fall back to the injected index.html (SPA routing).
    const deep = await fetch(`${baseUrl}/chat/123`);
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain("window.__ANGEL_DAEMON__");

    // `/api/*` stays behind bearer auth even with static hosting mounted.
    expect((await fetch(`${baseUrl}/api/health`)).status).toBe(401);

    // Path traversal cannot escape the mobile root.
    const traversal = await fetch(`${baseUrl}/../secret`);
    expect(await traversal.text()).toContain("window.__ANGEL_DAEMON__");
  });

  it("proxies the mobile Vite server, including HMR WebSockets", async () => {
    const mobileDevServerUrl = await startMobileDevServer();
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const daemon = await createDaemon({
      dataDir,
      mobileDevServerUrl,
      mobilePassword: "correct horse battery staple",
      serveMobile: true,
      token: "secret",
    });
    daemons.push(daemon);
    const baseUrl = `http://${daemon.info.host}:${daemon.info.port}`;

    const root = await fetch(`${baseUrl}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain(
      'window.__ANGEL_DAEMON__={"requiresAuth":true}',
    );

    const module = await fetch(`${baseUrl}/src/main.tsx`);
    expect(module.status).toBe(200);
    expect(await module.text()).toBe("export const mobile = true;");

    expect((await fetch(`${baseUrl}/api/health`)).status).toBe(401);

    const socket = new WebSocket(
      `ws://${daemon.info.host}:${daemon.info.port}/`,
      "vite-hmr",
    );
    const echoed = new Promise<string>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("open", () => socket.send("ping"));
      socket.once("message", (message) => resolve(message.toString()));
    });
    await expect(echoed).resolves.toBe("echo:ping");
    socket.close();
  });

  it("exchanges the mobile password for a session token via pairing", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const daemon = await createDaemon({
      dataDir,
      mobilePassword: "correct horse battery staple",
      token: "primary",
      version: "test",
    });
    daemons.push(daemon);
    const baseUrl = `http://${daemon.info.host}:${daemon.info.port}`;

    // Wrong password is rejected.
    const bad = await fetch(`${baseUrl}/api/auth/pair`, {
      body: JSON.stringify({ password: "nope" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(bad.status).toBe(401);

    // Correct password returns a session token distinct from the primary token.
    const ok = await fetch(`${baseUrl}/api/auth/pair`, {
      body: JSON.stringify({ password: "correct horse battery staple" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(ok.status).toBe(200);
    const { token: sessionToken } = (await ok.json()) as { token: string };
    expect(sessionToken).toBeTruthy();
    expect(sessionToken).not.toBe("primary");
    expect(sessionToken).not.toBe(
      createHash("sha256")
        .update("angel-mobile-session:correct horse battery staple")
        .digest("base64url"),
    );

    // The session token authorizes `/api/*` just like the primary token.
    const health = await fetch(`${baseUrl}/api/health`, {
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(health.status).toBe(200);
  });

  it("scopes the mobile session token to data routes only", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const daemon = await createDaemon({
      dataDir,
      mobilePassword: "correct horse battery staple",
      token: "primary",
    });
    daemons.push(daemon);
    const baseUrl = `http://${daemon.info.host}:${daemon.info.port}`;

    const paired = await fetch(`${baseUrl}/api/auth/pair`, {
      body: JSON.stringify({ password: "correct horse battery staple" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { token: sessionToken } = (await paired.json()) as { token: string };
    const auth = { authorization: `Bearer ${sessionToken}` };

    // Data routes are allowed.
    expect(
      (await fetch(`${baseUrl}/api/health`, { headers: auth })).status,
    ).toBe(200);

    // Lifecycle / process-control routes are forbidden for the mobile token.
    const shutdown = await fetch(`${baseUrl}/api/shutdown`, {
      headers: auth,
      method: "POST",
    });
    expect(shutdown.status).toBe(403);
    const kill = await fetch(`${baseUrl}/api/processes/1/kill`, {
      headers: auth,
      method: "POST",
    });
    expect(kill.status).toBe(403);
    const registry = await fetch(`${baseUrl}/api/process-registry`, {
      headers: auth,
    });
    expect(registry.status).toBe(403);

    // The daemon is still alive (shutdown was refused, not executed).
    expect(
      (await fetch(`${baseUrl}/api/health`, { headers: auth })).status,
    ).toBe(200);
  });

  it("throttles repeated failed pairing attempts", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const daemon = await createDaemon({
      dataDir,
      mobilePassword: "correct horse battery staple",
      token: "primary",
    });
    daemons.push(daemon);
    const baseUrl = `http://${daemon.info.host}:${daemon.info.port}`;

    const attempt = () =>
      fetch(`${baseUrl}/api/auth/pair`, {
        body: JSON.stringify({ password: "wrong" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

    // First failures are rejected with 401 …
    for (let index = 0; index < 5; index += 1) {
      expect((await attempt()).status).toBe(401);
    }
    // … then the endpoint is blocked with 429, even for the correct password.
    expect((await attempt()).status).toBe(429);
    const correct = await fetch(`${baseUrl}/api/auth/pair`, {
      body: JSON.stringify({ password: "correct horse battery staple" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(correct.status).toBe(429);
  });

  it("refuses pairing when no mobile password is configured", async () => {
    const daemon = await startDaemon();
    const response = await fetch(
      `http://${daemon.info.host}:${daemon.info.port}/api/auth/pair`,
      {
        body: JSON.stringify({ password: "anything" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(response.status).toBe(403);
  });

  it("serves the mobile data routes with a paired session", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const daemon = await createDaemon({
      dataDir,
      migrationsDir: path.resolve(
        import.meta.dirname,
        "../../../desktop/drizzle",
      ),
      mobilePassword: "correct horse battery staple",
      token: "primary",
    });
    daemons.push(daemon);
    const baseUrl = `http://${daemon.info.host}:${daemon.info.port}`;
    const paired = await fetch(`${baseUrl}/api/auth/pair`, {
      body: JSON.stringify({ password: "correct horse battery staple" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { token: sessionToken } = (await paired.json()) as { token: string };
    const headers = { authorization: `Bearer ${sessionToken}` };

    for (const pathname of ["/api/projects", "/api/agents", "/api/chats"]) {
      const response = await fetch(`${baseUrl}${pathname}`, { headers });
      expect(response.status, pathname).toBe(200);
      expect(await response.json(), pathname).toBeInstanceOf(Array);
    }
  });

  it("advertises a loopback host when binding the wildcard address", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "angel-daemon-"));
    const daemon = await createDaemon({
      dataDir,
      host: "0.0.0.0",
      token: "secret",
    });
    daemons.push(daemon);
    expect(daemon.info.host).toBe("127.0.0.1");
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
  const daemon = await createDaemon({
    dataDir,
    migrationsDir: path.resolve(
      import.meta.dirname,
      "../../../desktop/drizzle",
    ),
    token: "secret",
  });
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

async function startMobileDevServer(): Promise<string> {
  const http = createServer((request, response) => {
    if (request.url === "/src/main.tsx") {
      response.setHeader("content-type", "text/javascript");
      response.end("export const mobile = true;");
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><head></head><body>mobile dev</body>");
  });
  const webSockets = new WebSocketServer({ noServer: true });
  http.on("upgrade", (request, socket, head) => {
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.on("message", (message) => {
        webSocket.send(`echo:${message.toString()}`);
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  mobileDevServers.push({ http, webSockets });
  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("Mobile development test server did not bind a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}
