import type {
  WorkspaceBrowserError,
  WorkspaceBrowserErrorCode,
} from "../../../shared/workspace-browser";

/**
 * Chromium net error codes we care about for recovery copy. Full list lives
 * in net/base/net_error_list.h; only a closed, product-relevant set is mapped.
 */
const ERR_ABORTED = -3;
const ERR_CONNECTION_CLOSED = -100;
const ERR_CONNECTION_RESET = -101;
const ERR_CONNECTION_REFUSED = -102;
const ERR_CONNECTION_ABORTED = -103;
const ERR_CONNECTION_FAILED = -104;
const ERR_NAME_NOT_RESOLVED = -105;
const ERR_INTERNET_DISCONNECTED = -106;
const ERR_NETWORK_ACCESS_DENIED = -138;
const ERR_NETWORK_CHANGED = -21;
const ERR_TIMED_OUT = -7;
const ERR_CONNECTION_TIMED_OUT = -118;
const ERR_NAME_RESOLUTION_FAILED = -137;
const ERR_ADDRESS_UNREACHABLE = -109;
const ERR_PROXY_CONNECTION_FAILED = -130;

const OFFLINE_CODES = new Set([
  ERR_INTERNET_DISCONNECTED,
  ERR_NETWORK_CHANGED,
  ERR_NETWORK_ACCESS_DENIED,
  ERR_NAME_NOT_RESOLVED,
  ERR_NAME_RESOLUTION_FAILED,
  ERR_ADDRESS_UNREACHABLE,
  ERR_PROXY_CONNECTION_FAILED,
  ERR_CONNECTION_CLOSED,
  ERR_CONNECTION_RESET,
  ERR_CONNECTION_REFUSED,
  ERR_CONNECTION_ABORTED,
  ERR_CONNECTION_FAILED,
  ERR_TIMED_OUT,
  ERR_CONNECTION_TIMED_OUT,
]);

export interface WorkspaceBrowserLoadFailureInput {
  errorCode: number;
  errorDescription: string;
  isMainFrame: boolean;
  validatedURL: string;
}

/**
 * Map a Chromium `did-fail-load` payload into a protocol-neutral error, or
 * `null` when the failure should not surface (subframe / aborted navigation).
 */
export function normalizeWorkspaceBrowserLoadFailure(
  input: WorkspaceBrowserLoadFailureInput,
): WorkspaceBrowserError | null {
  if (!input.isMainFrame) {
    return null;
  }
  // A new navigation often aborts the previous one; treat as non-error.
  if (input.errorCode === ERR_ABORTED) {
    return null;
  }

  const code = workspaceBrowserErrorCodeForNetError(input.errorCode);
  const url = sanitizeBrowserUrl(input.validatedURL);
  const detail = hostnameForBrowserUrl(url);

  return {
    code,
    ...(detail !== undefined ? { detail } : {}),
    ...(url !== undefined ? { url } : {}),
  };
}

/**
 * Map a rejected `loadURL` / navigate throw into a safe renderer-facing error.
 * Never forwards stack traces or Electron internal wording.
 */
export function normalizeWorkspaceBrowserNavigateFailure(
  error: unknown,
  url: string,
): WorkspaceBrowserError {
  if (isUnsupportedUrlError(error)) {
    return {
      code: "unsupported_url",
      url: sanitizeBrowserUrl(url),
    };
  }

  const message = errorMessage(error);
  if (
    /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|offline/i.test(
      message,
    )
  ) {
    return {
      code: "offline",
      detail: hostnameForBrowserUrl(url),
      url: sanitizeBrowserUrl(url),
    };
  }

  return {
    code: "navigation_failed",
    detail: hostnameForBrowserUrl(url),
    url: sanitizeBrowserUrl(url),
  };
}

export function workspaceBrowserErrorCodeForNetError(
  errorCode: number,
): WorkspaceBrowserErrorCode {
  if (OFFLINE_CODES.has(errorCode)) {
    return "offline";
  }
  if (errorCode < 0) {
    return "navigation_failed";
  }
  return "unknown";
}

export function sanitizeBrowserUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed || trimmed === "about:blank") {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}

export function hostnameForBrowserUrl(
  url: string | undefined,
): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    const host = new URL(url).hostname;
    return host.length > 0 ? host : undefined;
  } catch {
    return undefined;
  }
}

function isUnsupportedUrlError(error: unknown): boolean {
  return /only supports http\(s\)/i.test(errorMessage(error));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}
