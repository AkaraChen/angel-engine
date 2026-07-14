import type { DaemonInfo } from "@angel-engine/daemon";
import type { UtilityProcess } from "electron";
import type { DaemonConnection } from "../../shared/daemon";
import type {
  MobileHostingConfig,
  MobileHostingState,
} from "../../shared/mobile-hosting";

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import is from "@sindresorhus/is";
import { app, BrowserWindow, ipcMain, utilityProcess } from "electron";
import {
  DAEMON_CHANGED_CHANNEL,
  DAEMON_INFO_CHANNEL,
} from "../../shared/daemon";
import {
  MOBILE_HOSTING_CHANGED_CHANNEL,
  sanitizeMobileHostingConfig,
} from "../../shared/mobile-hosting";
import {
  mobileHostingConfigEquals,
  readMobileHostingConfig,
  readMobileHostingRuntimeMarker,
  resolveMobileDir,
  resolveMobileUrl,
  writeMobileHostingConfig,
  writeMobileHostingRuntimeMarker,
} from "./mobile-hosting";

const HANDSHAKE_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_INTERVAL_MS = 2_000;
const RESPAWN_DELAYS_MS = [250, 1_000, 3_000, 10_000] as const;

let child: UtilityProcess | undefined;
let connection: DaemonConnection = {
  error: "Backend is starting.",
  status: "unavailable",
};
let intentionalShutdown = false;
let respawnAttempt = 0;
let respawnTimer: NodeJS.Timeout | undefined;
let healthTimer: NodeJS.Timeout | undefined;
let mobileConfig: MobileHostingConfig | undefined;
const connectionListeners = new Set<(connection: DaemonConnection) => void>();

function getMobileConfig(): MobileHostingConfig {
  if (mobileConfig === undefined) {
    mobileConfig = readMobileHostingConfig();
  }
  return mobileConfig;
}

function buildDaemonArgs(): string[] {
  const config = getMobileConfig();
  const args = [
    "--data-dir",
    app.getPath("userData"),
    "--host",
    config.enabled ? config.host : "127.0.0.1",
    "--port",
    "0",
    "--version",
    app.getVersion(),
  ];
  if (config.enabled) {
    const mobileDir = resolveMobileDir();
    if (mobileDir !== undefined) {
      args.push("--serve-mobile", "--mobile-dir", mobileDir);
    }
  }
  return args;
}

function currentMobileState(): MobileHostingState {
  const config = getMobileConfig();
  const port = connection.status === "available" ? connection.info.port : null;
  const serving =
    port !== null && config.enabled && resolveMobileDir() !== undefined;
  return {
    available: serving,
    enabled: config.enabled,
    host: config.host,
    port,
    url: config.enabled ? resolveMobileUrl(config.host, port) : null,
  };
}

function broadcastMobileState() {
  const state = currentMobileState();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(MOBILE_HOSTING_CHANGED_CHANNEL, state);
  }
}

export function getMobileHostingState(): MobileHostingState {
  return currentMobileState();
}

export async function setMobileHostingConfig(
  input: unknown,
): Promise<MobileHostingState> {
  const next = sanitizeMobileHostingConfig(input);
  const previous = getMobileConfig();
  mobileConfig = next;
  writeMobileHostingConfig(next);
  if (!mobileHostingConfigEquals(previous, next)) {
    await restartDaemon();
  }
  broadcastMobileState();
  return currentMobileState();
}

export function subscribeDaemonConnection(
  listener: (connection: DaemonConnection) => void,
) {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export async function fetchDaemon(pathname: string, init?: RequestInit) {
  if (connection.status !== "available") return undefined;
  return fetch(daemonUrl(connection.info, pathname), {
    ...init,
    headers: { ...authorizationHeaders(connection.info), ...init?.headers },
  });
}

export function registerDaemonIpc() {
  ipcMain.handle(DAEMON_INFO_CHANNEL, () => connection);
}

export async function startDaemonSupervisor() {
  intentionalShutdown = false;
  const reattached = await tryReattach();
  if (reattached !== undefined) {
    setConnection({ info: reattached, status: "available" });
    scheduleHealthCheck();
    return;
  }
  await spawnDaemon();
}

export async function stopDaemonSupervisor() {
  intentionalShutdown = true;
  if (respawnTimer !== undefined) {
    clearTimeout(respawnTimer);
    respawnTimer = undefined;
  }
  if (healthTimer !== undefined) {
    clearTimeout(healthTimer);
    healthTimer = undefined;
  }

  const active =
    connection.status === "available" ? connection.info : undefined;
  setConnection({ error: "Backend is shutting down.", status: "unavailable" });
  if (active !== undefined) {
    try {
      await fetch(daemonUrl(active, "/api/shutdown"), {
        headers: authorizationHeaders(active),
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      console.warn("Failed to stop daemon gracefully.", error);
      child?.kill();
    }
  }
  child = undefined;
}

async function tryReattach() {
  const filePath = daemonInfoPath();
  let candidate: DaemonInfo;
  try {
    candidate = parseDaemonInfo(await readFile(filePath, "utf8"));
  } catch {
    await rm(filePath, { force: true });
    return undefined;
  }

  let healthVersion: string | undefined;
  try {
    const response = await fetch(daemonUrl(candidate, "/api/health"), {
      headers: authorizationHeaders(candidate),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok)
      throw new Error(`Health check returned ${response.status}.`);
    const health = (await response.json()) as { version?: string };
    healthVersion = health.version;
  } catch {
    await rm(filePath, { force: true });
    return undefined;
  }

  if (
    healthVersion !== app.getVersion() ||
    candidate.version !== app.getVersion()
  ) {
    await stopDiscoveredDaemon(candidate);
    await rm(filePath, { force: true });
    return undefined;
  }

  // Only reuse a running daemon when it was launched with the current mobile
  // hosting config; otherwise it may be bound to the wrong host or (still)
  // serving the mobile app after the toggle changed while the app was closed.
  const marker = readMobileHostingRuntimeMarker();
  if (marker === undefined || !mobileHostingConfigEquals(marker, getMobileConfig())) {
    await stopDiscoveredDaemon(candidate);
    await rm(filePath, { force: true });
    return undefined;
  }
  return candidate;
}

async function stopDiscoveredDaemon(candidate: DaemonInfo) {
  const response = await fetch(daemonUrl(candidate, "/api/shutdown"), {
    headers: authorizationHeaders(candidate),
    method: "POST",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Daemon shutdown returned ${response.status}.`);
  }
}

async function spawnDaemon() {
  setConnection({ error: "Backend is starting.", status: "unavailable" });
  const daemonEntry = path.join(__dirname, "daemon.js");
  const launchConfig = getMobileConfig();
  const nextChild = utilityProcess.fork(daemonEntry, buildDaemonArgs(), {
    stdio: "pipe",
  });
  child = nextChild;
  pipeDaemonLogs(nextChild);

  try {
    const info = await waitForHandshake(nextChild);
    if (child !== nextChild) return;
    respawnAttempt = 0;
    writeMobileHostingRuntimeMarker(launchConfig);
    setConnection({ info, status: "available" });
    scheduleHealthCheck();
  } catch (error) {
    if (child === nextChild) {
      child = undefined;
      setConnection({ error: errorMessage(error), status: "unavailable" });
      nextChild.kill();
      scheduleRespawn();
    }
  }

  nextChild.once("exit", (code) => {
    if (child !== nextChild) return;
    child = undefined;
    if (healthTimer !== undefined) {
      clearTimeout(healthTimer);
      healthTimer = undefined;
    }
    if (intentionalShutdown) return;
    setConnection({
      error: `Backend exited with code ${code}.`,
      status: "unavailable",
    });
    scheduleRespawn();
  });
}

function scheduleHealthCheck() {
  if (intentionalShutdown || healthTimer !== undefined) return;
  healthTimer = setTimeout(() => {
    void runHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);
}

async function runHealthCheck() {
  healthTimer = undefined;
  if (intentionalShutdown || connection.status !== "available") return;
  const active = connection.info;
  try {
    const response = await fetch(daemonUrl(active, "/api/health"), {
      headers: authorizationHeaders(active),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok)
      throw new Error(`Health check returned ${response.status}.`);
    scheduleHealthCheck();
  } catch {
    await rm(daemonInfoPath(), { force: true });
    if (child !== undefined) {
      child.kill();
      return;
    }
    setConnection({
      error: "Backend health check failed.",
      status: "unavailable",
    });
    scheduleRespawn();
  }
}

async function waitForHandshake(process: UtilityProcess) {
  return new Promise<DaemonInfo>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for daemon handshake."));
    }, HANDSHAKE_TIMEOUT_MS);
    const onExit = (code: number) => {
      cleanup();
      reject(new Error(`Daemon exited before handshake with code ${code}.`));
    };
    const onMessage = (message: unknown) => {
      try {
        const info = parseDaemonInfo(message);
        cleanup();
        resolve(info);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      process.off("exit", onExit);
      process.off("message", onMessage);
    };
    process.once("exit", onExit);
    process.once("message", onMessage);
  });
}

function scheduleRespawn() {
  if (intentionalShutdown || respawnTimer !== undefined) return;
  const delay =
    RESPAWN_DELAYS_MS[Math.min(respawnAttempt, RESPAWN_DELAYS_MS.length - 1)];
  respawnAttempt += 1;
  respawnTimer = setTimeout(() => {
    respawnTimer = undefined;
    void spawnDaemon();
  }, delay);
}

function setConnection(next: DaemonConnection) {
  connection = next;
  for (const listener of connectionListeners) listener(next);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(DAEMON_CHANGED_CHANNEL, next);
  }
  // The reachable mobile URL depends on the daemon port, which changes on
  // every respawn — keep renderers in sync whenever the connection changes.
  broadcastMobileState();
}

async function restartDaemon() {
  if (respawnTimer !== undefined) {
    clearTimeout(respawnTimer);
    respawnTimer = undefined;
  }
  if (healthTimer !== undefined) {
    clearTimeout(healthTimer);
    healthTimer = undefined;
  }
  respawnAttempt = 0;

  const active =
    connection.status === "available" ? connection.info : undefined;
  const previousChild = child;
  // Detach the current child so its exit handler no-ops (its `child !==
  // nextChild` guard now holds) and does not trigger an extra respawn.
  child = undefined;
  if (active !== undefined) {
    try {
      await fetch(daemonUrl(active, "/api/shutdown"), {
        headers: authorizationHeaders(active),
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      console.warn("Failed to stop daemon for reconfigure.", error);
      previousChild?.kill();
    }
  } else {
    previousChild?.kill();
  }
  await rm(daemonInfoPath(), { force: true });
  await spawnDaemon();
}

function pipeDaemonLogs(daemonProcess: UtilityProcess) {
  daemonProcess.stdout?.on("data", (chunk: Buffer) =>
    console.warn(`[daemon] ${chunk.toString().trimEnd()}`),
  );
  daemonProcess.stderr?.on("data", (chunk: Buffer) =>
    console.error(`[daemon] ${chunk.toString().trimEnd()}`),
  );
}

function daemonInfoPath() {
  return path.join(app.getPath("userData"), "daemon.json");
}

function daemonUrl(info: DaemonInfo, pathname: string) {
  return `http://${info.host}:${info.port}${pathname}`;
}

function authorizationHeaders(info: DaemonInfo) {
  return { authorization: `Bearer ${info.token}` };
}

function parseDaemonInfo(value: unknown): DaemonInfo {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !is.plainObject(parsed) ||
    !is.nonEmptyString(parsed.host) ||
    !is.integer(parsed.port) ||
    parsed.port < 1 ||
    parsed.port > 65_535 ||
    !is.nonEmptyString(parsed.token) ||
    !is.integer(parsed.pid) ||
    !is.nonEmptyString(parsed.version)
  ) {
    throw new TypeError("Daemon handshake is malformed.");
  }
  return {
    host: parsed.host,
    pid: parsed.pid,
    port: parsed.port,
    token: parsed.token,
    version: parsed.version,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Backend failed to start.";
}
