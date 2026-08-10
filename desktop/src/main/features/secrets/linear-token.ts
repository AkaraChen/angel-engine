import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

type DaemonFetch = (
  pathname: string,
  init?: RequestInit,
) => Promise<Response | undefined>;

const SECRET_FILE_NAME = "linear-token.enc";

function secretPath() {
  return path.join(app.getPath("userData"), SECRET_FILE_NAME);
}

function readLinearToken(): string | undefined {
  try {
    const encrypted = fs.readFileSync(secretPath());
    return safeStorage.decryptString(encrypted);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return undefined;
    }
    throw cause;
  }
}

export function hasLinearToken() {
  return fs.existsSync(secretPath());
}

export async function setLinearToken(token: string, fetchDaemon: DaemonFetch) {
  const normalized = token.trim();
  if (normalized.length === 0) throw new Error("Linear API token is required.");
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is not available on this device.");
  }

  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(secretPath(), safeStorage.encryptString(normalized), {
    mode: 0o600,
  });
  fs.chmodSync(secretPath(), 0o600);
  await pushLinearTokenToDaemon(fetchDaemon);
  return { hasToken: true };
}

export async function clearLinearToken(fetchDaemon: DaemonFetch) {
  fs.rmSync(secretPath(), { force: true });
  await pushLinearTokenToDaemon(fetchDaemon);
  return { hasToken: false };
}

export async function pushLinearTokenToDaemon(fetchDaemon: DaemonFetch) {
  const response = await fetchDaemon("/api/internal/secrets/linear", {
    body: JSON.stringify({ token: readLinearToken() }),
    headers: { "content-type": "application/json" },
    method: "PUT",
    signal: AbortSignal.timeout(5_000),
  });
  if (response !== undefined && !response.ok) {
    throw new Error(
      `Could not update daemon Linear token (${response.status}).`,
    );
  }
}
