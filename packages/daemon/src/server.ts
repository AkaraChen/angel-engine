import type { ServerType } from "@hono/node-server";
import type { DaemonHealth, DaemonInfo, DaemonOptions } from "./types";

import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerMobileHosting } from "./mobile-hosting";
import {
  isProcessId,
  parseKillBody,
  parseRegistryBody,
  ProcessRegistry,
} from "./processes";

/**
 * Wildcard bind hosts cannot be dialed back by the desktop shell on every OS
 * (e.g. macOS refuses `connect(0.0.0.0)`), so the daemon advertises a loopback
 * address in its handshake/info file while still binding the wildcard for LAN
 * reachability.
 */
function advertiseHostFor(bindHost: string): string {
  if (bindHost === "0.0.0.0") return "127.0.0.1";
  if (bindHost === "::" || bindHost === "::0") return "::1";
  return bindHost;
}

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
  let server: ServerType | undefined;

  app.use(
    "/api/*",
    cors({
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
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
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
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

  // Static mobile hosting is registered last so the token-guarded `/api/*`
  // routes above keep precedence over the SPA fallback.
  if (options.serveMobile === true && options.mobileDir !== undefined) {
    await registerMobileHosting(app, options.mobileDir, token);
  }

  server = await new Promise<ServerType>((resolve, reject) => {
    const candidate = serve(
      { fetch: app.fetch, hostname: host, port: options.port ?? 0 },
      (address) => resolve(candidate),
    );
    candidate.once("error", reject);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await close();
    throw new Error("Daemon did not bind a TCP port.");
  }

  const info: DaemonInfo = {
    host: advertiseHostFor(host),
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
