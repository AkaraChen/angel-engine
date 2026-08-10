import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DaemonConnection {
  /** How the CLI resolved this connection (for `which`). */
  source: string;
  token: string;
  /** Origin only, no trailing slash. */
  url: string;
}

export interface ConnectionOverrides {
  infoPath?: string;
  token?: string;
  url?: string;
}

/**
 * Resolve daemon base URL + bearer token.
 *
 * Precedence:
 * 1. `--url` + `--token` (token may still come from env/file if only URL set)
 * 2. `ANGEL_DAEMON_URL` + `ANGEL_DAEMON_TOKEN`
 * 3. `--info` / `ANGEL_DAEMON_INFO` JSON file
 * 4. Well-known / app userData `daemon.json` candidates
 */
export function resolveDaemonConnection(
  overrides: ConnectionOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir(),
): DaemonConnection {
  const flagUrl = normalizeUrl(overrides.url);
  const flagToken = nonEmpty(overrides.token);
  if (flagUrl !== undefined && flagToken !== undefined) {
    return { source: "flags", token: flagToken, url: flagUrl };
  }

  const envUrl = normalizeUrl(env.ANGEL_DAEMON_URL);
  const envToken = nonEmpty(env.ANGEL_DAEMON_TOKEN);
  if (flagUrl !== undefined && envToken !== undefined) {
    return { source: "flags+env", token: envToken, url: flagUrl };
  }
  if (envUrl !== undefined && envToken !== undefined) {
    return { source: "env", token: envToken, url: envUrl };
  }
  if (flagUrl !== undefined && flagToken === undefined) {
    throw new ConnectionError(
      "Missing daemon token. Pass --token or set ANGEL_DAEMON_TOKEN.",
    );
  }
  if (envUrl !== undefined && envToken === undefined) {
    throw new ConnectionError(
      "ANGEL_DAEMON_URL is set but ANGEL_DAEMON_TOKEN is missing.",
    );
  }

  const infoPath =
    nonEmpty(overrides.infoPath) ?? nonEmpty(env.ANGEL_DAEMON_INFO);
  if (infoPath !== undefined) {
    return connectionFromInfoFile(infoPath, `info:${infoPath}`);
  }

  for (const candidate of defaultDaemonInfoPaths(homeDir, env)) {
    try {
      return connectionFromInfoFile(candidate, `file:${candidate}`);
    } catch (error) {
      if (error instanceof ConnectionError && error.code === "not_found") {
        continue;
      }
      throw error;
    }
  }

  throw new ConnectionError(
    [
      "Could not resolve daemon connection.",
      "Set ANGEL_DAEMON_URL + ANGEL_DAEMON_TOKEN, pass --url/--token,",
      "or ensure a daemon.json exists (e.g. ~/.angel-engine/daemon.json).",
    ].join(" "),
  );
}

export function defaultDaemonInfoPaths(
  homeDir: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const engineHome =
    typeof env.ANGEL_ENGINE_HOME === "string" &&
    env.ANGEL_ENGINE_HOME.trim().length > 0
      ? env.ANGEL_ENGINE_HOME.trim()
      : path.join(homeDir, ".angel-engine");
  const paths = [path.join(engineHome, "daemon.json")];
  if (process.platform === "darwin") {
    const support = path.join(homeDir, "Library", "Application Support");
    paths.push(
      path.join(support, "Angel Engine", "daemon.json"),
      path.join(support, "Angel Engine Dev", "daemon.json"),
    );
  } else if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
    paths.push(
      path.join(appData, "Angel Engine", "daemon.json"),
      path.join(appData, "Angel Engine Dev", "daemon.json"),
    );
  } else {
    const configHome =
      process.env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config");
    paths.push(
      path.join(configHome, "Angel Engine", "daemon.json"),
      path.join(configHome, "angel-engine", "daemon.json"),
      path.join(configHome, "Angel Engine Dev", "daemon.json"),
    );
  }
  return paths;
}

export class ConnectionError extends Error {
  readonly code: "not_found" | "invalid" | "missing";

  constructor(message: string, code: ConnectionError["code"] = "missing") {
    super(message);
    this.name = "ConnectionError";
    this.code = code;
  }
}

function connectionFromInfoFile(
  filePath: string,
  source: string,
): DaemonConnection {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    throw new ConnectionError(
      `Daemon info file not found: ${filePath}`,
      "not_found",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ConnectionError(
      `Daemon info file is not valid JSON: ${filePath}`,
      "invalid",
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as { host?: unknown }).host !== "string" ||
    typeof (parsed as { port?: unknown }).port !== "number" ||
    typeof (parsed as { token?: unknown }).token !== "string" ||
    (parsed as { host: string }).host.length === 0 ||
    (parsed as { token: string }).token.length === 0
  ) {
    throw new ConnectionError(
      `Daemon info file is malformed: ${filePath}`,
      "invalid",
    );
  }

  const host = (parsed as { host: string }).host;
  const port = (parsed as { port: number }).port;
  const token = (parsed as { token: string }).token;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConnectionError(
      `Daemon info file has an invalid port: ${filePath}`,
      "invalid",
    );
  }

  return {
    source,
    token,
    url: `http://${host}:${port}`,
  };
}

function normalizeUrl(value: string | undefined): string | undefined {
  const trimmed = nonEmpty(value);
  if (trimmed === undefined) return undefined;
  return trimmed.replace(/\/+$/, "");
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
