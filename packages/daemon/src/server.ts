import type { ServerType } from "@hono/node-server";
import type { Server as HttpServer } from "node:http";
import type { DaemonHealth, DaemonInfo } from "@angel-engine/daemon-api/daemon";
import type { DaemonOptions } from "./types";

import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer } from "ws";
import { registerApi } from "./api";
import { closeDatabase, configureDatabase } from "./db/client";
import { createChatRuntime } from "./features/chat/engine-runtime";
import { TerminalManager } from "./features/terminal/manager";
import {
  isProcessId,
  parseKillBody,
  parseRegistryBody,
  ProcessRegistry,
} from "./processes";

export interface Daemon {
  app: Hono;
  info: DaemonInfo;
  close: () => Promise<void>;
}

export async function createDaemon(options: DaemonOptions): Promise<Daemon> {
  const host = options.host ?? "127.0.0.1";
  const token = options.token ?? randomBytes(32).toString("base64url");
  const version = options.version ?? "0.1.0";
  const startedAt = process.uptime();
  const app = new Hono();
  const processRegistry = new ProcessRegistry();
  const chatRuntime = createChatRuntime(processRegistry);
  const terminalManager = new TerminalManager();
  const eventSockets = new Set<import("ws").WebSocket>();
  const webSockets = new WebSocketServer({ noServer: true });
  let server: ServerType | undefined;

  configureDatabase({
    dataDir: options.dataDir,
    migrationsDir:
      options.migrationsDir ?? path.resolve(process.cwd(), "drizzle"),
    packaged: options.packaged ?? false,
  });

  app.use(
    "/api/*",
    cors({
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["DELETE", "GET", "PATCH", "POST", "PUT", "OPTIONS"],
      origin: "*",
    }),
  );

  app.use("/api/*", async (context, next) => {
    if (context.req.header("authorization") !== `Bearer ${token}`) {
      return context.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  app.get("/api/health", (context) => {
    const health: DaemonHealth = {
      pid: process.pid,
      uptime: process.uptime() - startedAt,
      version,
    };
    return context.json(health);
  });

  app.onError((error, context) => {
    const status = error instanceof TypeError ? 400 : 500;
    return context.json({ error: error.message }, status);
  });

  registerApi(app, chatRuntime, {
    publish(event) {
      const payload = JSON.stringify(event);
      for (const socket of eventSockets) {
        if (socket.readyState === socket.OPEN) socket.send(payload);
      }
    },
  });

  app.put("/api/process-registry", async (context) => {
    try {
      processRegistry.replace(parseRegistryBody(await context.req.json()));
      return context.json({ ok: true });
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Invalid request." },
        400,
      );
    }
  });

  app.get("/api/process-registry", (context) => {
    return context.json({ entries: processRegistry.snapshot() });
  });

  app.post("/api/processes/:pid/kill", async (context) => {
    const pid = Number(context.req.param("pid"));
    if (!isProcessId(pid)) return context.json({ error: "Invalid pid." }, 400);
    try {
      const bodyText = await context.req.text();
      const { force } = parseKillBody(
        bodyText.length === 0 ? undefined : JSON.parse(bodyText),
      );
      if (!processRegistry.kill(pid, force)) {
        return context.json({ error: "Process is not registered." }, 403);
      }
      return context.json({ ok: true });
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Invalid request." },
        400,
      );
    }
  });

  const close = async () => {
    if (server === undefined) return;
    const activeServer = server;
    server = undefined;
    chatRuntime.closeChatSession();
    terminalManager.close();
    for (const socket of webSockets.clients)
      socket.close(1001, "Daemon shutdown");
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    webSockets.close();
    closeDatabase();
  };

  app.post("/api/shutdown", async (context) => {
    setImmediate(
      () =>
        void close().finally(() => {
          options.onShutdown?.();
        }),
    );
    return context.json({ ok: true });
  });

  server = await new Promise<ServerType>((resolve, reject) => {
    const candidate = serve(
      { fetch: app.fetch, hostname: host, port: options.port ?? 0 },
      (address) => resolve(candidate),
    );
    candidate.once("error", reject);
  });

  (server as HttpServer).on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${host}`);
    if (
      (request.headers.authorization !== `Bearer ${token}` &&
        request.headers["sec-websocket-protocol"] !==
          `angel-engine-token.${token}`) ||
      (url.pathname !== "/api/events" && url.pathname !== "/api/terminals")
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      if (url.pathname === "/api/events") {
        eventSockets.add(webSocket);
        webSocket.once("close", () => eventSockets.delete(webSocket));
        return;
      }
      webSocket.on("message", (data) => {
        try {
          terminalManager.handle(
            webSocket,
            JSON.parse(data.toString()) as unknown,
          );
        } catch (error) {
          webSocket.send(
            JSON.stringify({
              event: {
                message: error instanceof Error ? error.message : String(error),
                type: "error",
              },
            }),
          );
        }
      });
      webSocket.once("close", () => terminalManager.disconnect(webSocket));
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await close();
    throw new Error("Daemon did not bind a TCP port.");
  }

  const info: DaemonInfo = {
    host,
    pid: process.pid,
    port: address.port,
    token,
    version,
  };
  await writeDaemonInfo(options.dataDir, info);

  return { app, close, info };
}

async function writeDaemonInfo(dataDir: string, info: DaemonInfo) {
  await mkdir(dataDir, { recursive: true });
  const target = path.join(dataDir, "daemon.json");
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, target);
}
