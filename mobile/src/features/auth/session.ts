/**
 * Mobile session auth: the paired token is stored locally on this device and
 * traded for via the daemon's `/api/auth/pair` endpoint. No token is ever
 * embedded in the served page — the user must enter the pairing password once.
 */

const TOKEN_STORAGE_KEY = "angel-engine.mobile.session-token";

export type PairingFailure = "invalid-password" | "server-error";

export class PairingError extends Error {
  constructor(
    readonly reason: PairingFailure,
    readonly status: number,
  ) {
    super(reason);
    this.name = "PairingError";
  }
}

export function readStoredToken(): string | null {
  try {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    return token !== null && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function writeStoredToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    else window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Private-mode / disabled storage: the token simply won't persist across
    // reloads, which only means re-entering the password. Not fatal.
  }
}

/**
 * Exchanges the pairing password for a session token via `/api/auth/pair`.
 * Throws {@link PairingError} on a wrong password (401) or any other failure.
 */
export async function requestPairing(
  baseUrl: string,
  password: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/auth/pair`, {
      body: JSON.stringify({ password }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    throw new PairingError("server-error", 0);
  }

  if (!response.ok) {
    throw new PairingError(
      response.status === 401 ? "invalid-password" : "server-error",
      response.status,
    );
  }

  const data = (await response.json()) as { token?: unknown };
  if (typeof data.token !== "string" || data.token.length === 0) {
    throw new PairingError("server-error", response.status);
  }
  return data.token;
}
