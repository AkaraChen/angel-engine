import { Data } from "effect";

/** Stable machine-readable main-process IPC error codes. */
export type MainIpcErrorCode =
  | "daemon-request-failed"
  | "daemon-unavailable"
  | "main-invalid-request"
  | "main-not-found"
  | "main-operation-failed";

interface MainIpcErrorProps {
  cause?: unknown;
  code: MainIpcErrorCode;
  message: string;
}

/**
 * The main process's only IPC error type. Every failure case is constructed
 * through a static factory that stamps a stable `code`. Electron serializes
 * only the message across the bridge; codes drive main-side handling/logging.
 */
export class MainIpcError extends Data.TaggedError(
  "MainIpcError",
)<MainIpcErrorProps> {
  static invalidRequest(message: string) {
    return new MainIpcError({ code: "main-invalid-request", message });
  }

  static notFound(message: string) {
    return new MainIpcError({ code: "main-not-found", message });
  }

  static daemonUnavailable() {
    return new MainIpcError({
      code: "daemon-unavailable",
      message: "Backend is unavailable.",
    });
  }

  static daemonRequestFailed(message: string) {
    return new MainIpcError({ code: "daemon-request-failed", message });
  }

  static operationFailed(cause: unknown) {
    return new MainIpcError({
      cause,
      code: "main-operation-failed",
      message:
        cause instanceof Error && cause.message.length > 0
          ? cause.message
          : "Desktop operation failed.",
    });
  }
}
