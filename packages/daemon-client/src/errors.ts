import type { DaemonErrorCode } from "@angel-engine/daemon-api/daemon";

/**
 * A failed daemon request. `code` is the daemon's machine-readable error code
 * when the response carried one; clients branch on it, never on message text.
 */
export class DaemonRequestError extends Error {
  override readonly name = "DaemonRequestError";
  readonly code: DaemonErrorCode | undefined;
  readonly status: number;

  private constructor(
    message: string,
    status: number,
    code: DaemonErrorCode | undefined,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }

  /** The daemon rejected the request; carries its `{ code, error }` payload. */
  static http(
    status: number,
    code: DaemonErrorCode | undefined,
    message: string,
  ) {
    return new DaemonRequestError(message, status, code);
  }

  /** The daemon cannot be reached (no connection, tunnel down, ...). */
  static unavailable(message = "Backend is unavailable.") {
    return new DaemonRequestError(message, 0, undefined);
  }

  /** The response body was not what the contract promises (non-JSON, empty stream). */
  static invalidResponse(message: string, status: number) {
    return new DaemonRequestError(message, status, undefined);
  }
}
