import type { ServerType } from "@hono/node-server";
import type { DaemonHealth, DaemonInfo, DaemonOptions } from "./types";

import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deriveMobileToken, parsePairBody, safeEqual } from "./mobile-auth";
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

/**
 * Routes that control the daemon's lifecycle or host processes. Only the
 * desktop's primary token may reach these — a paired mobile session token is
 * restricted to data routes.
 */
function isPrivilegedPath(pathname: string): boolean {
  return pathname === "/api/shutdown" || pathname.startsWith("/api/process");
}

const PAIR_MAX_FAILURES = 5;
const PAIR_BLOCK_MS = 60_000;

/**
 * Fixed-window throttle for `/api/auth/pair`. After too many failed attempts the
 * endpoint is blocked for a cooldown, slowing password brute-forcing on the LAN.
 * Deliberately in-memory and process-wide: a daemon restart clears it, which is
 * acceptable for a local-network tool.
 */
class PairThrottle {
  private failures = 0;
  private blockedUntil = 0;

  isBlocked(): boolean {
    return this.failures >= PAIR_MAX_FAILURES && Date.now() < this.blockedUntil;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= PAIR_MAX_FAILURES) {
      this.blockedUntil = Date.now() + PAIR_BLOCK_MS;
    }
  }

  reset(): void {
    this.failures = 0;
    this.blockedUntil = 0;
  }
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
  // A mobile client trades the configured password for this session token. It is
  // accepted alongside the primary token so paired phones can reach `/api/*`
  // without ever seeing the primary token.
  const mobilePassword =
    options.mobilePassword !== undefined && options.mobilePassword.length > 0
      ? options.mobilePassword
      : undefined;
  const mobileToken =
    mobilePassword !== undefined
      ? deriveMobileToken(mobilePassword)
      : undefined;
  const app = new Hono();
  const processRegistry = new ProcessRegistry();
  const pairThrottle = new PairThrottle();
  let server: ServerType | undefined;

  app.use(
    "/api/*",
    cors({
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      origin: "*",
    }),
  );

  // Pairing is the one unauthenticated `/api/*` route: it is how a mobile client
  // obtains a token in the first place. Repeated failures are throttled so a LAN
  // attacker cannot brute-force the password.
  app.post("/api/auth/pair", async (context) => {
    if (mobilePassword === undefined || mobileToken === undefined) {
      return context.json({ error: "Pairing is not enabled." }, 403);
    }
    if (pairThrottle.isBlocked()) {
      return context.json(
        { error: "Too many attempts. Try again later." },
        429,
      );
    }
    let password: string | undefined;
    try {
      const bodyText = await context.req.text();
      password = parsePairBody(
        bodyText.length === 0 ? undefined : JSON.parse(bodyText),
      );
    } catch {
      password = undefined;
    }
    if (password === undefined || !safeEqual(password, mobilePassword)) {
      pairThrottle.recordFailure();
      return context.json({ error: "Invalid password." }, 401);
    }
    pairThrottle.reset();
    return context.json({ token: mobileToken });
  });

  app.use("/api/*", async (context, next) => {
    const authorization = context.req.header("authorization");
    const isPrimary = authorization === `Bearer ${token}`;
    const isMobile =
      mobileToken !== undefined && authorization === `Bearer ${mobileToken}`;
    if (!isPrimary && !isMobile) {
      return context.json({ error: "Unauthorized" }, 401);
    }
    // A paired mobile client is scoped to data routes only. Daemon lifecycle and
    // process control (shutdown, the process registry, killing processes) stay
    // exclusive to the desktop's primary token, so a phone — or anyone who
    // recovers a session token — cannot stop the backend or kill processes.
    if (isMobile && !isPrimary && isPrivilegedPath(context.req.path)) {
      return context.json({ error: "Forbidden" }, 403);
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
  // routes above keep precedence over the SPA fallback. Only serve the bundle
  // when a mobile password is configured, so the LAN surface always sits behind
  // the pairing flow.
  if (
    options.serveMobile === true &&
    options.mobileDir !== undefined &&
    mobilePassword !== undefined
  ) {
    await registerMobileHosting(app, options.mobileDir);
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
