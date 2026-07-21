import { Data } from "effect";

/** Stable machine-readable agent-session error codes. */
export type AgentSessionErrorCode =
  | "session-closed"
  | "session-invalid-request"
  | "session-operation-failed"
  | "session-rpc-failed";

interface AgentSessionErrorProps {
  cause?: unknown;
  code: AgentSessionErrorCode;
  message: string;
  /** Canonical runtime id of the provider that raised the error. */
  provider: string;
}

/**
 * The shared error type for provider agent sessions (claude, pi, ...). Every
 * failure case is constructed through a static factory that stamps a stable
 * `code`; `provider` identifies the raising client.
 */
export class AgentSessionError extends Data.TaggedError(
  "AgentSessionError",
)<AgentSessionErrorProps> {
  static invalidRequest(provider: string, message: string) {
    return new AgentSessionError({
      code: "session-invalid-request",
      message,
      provider,
    });
  }

  static sessionClosed(provider: string) {
    return new AgentSessionError({
      code: "session-closed",
      message: "Chat session closed.",
      provider,
    });
  }

  static rpcFailed(provider: string, cause: unknown) {
    return new AgentSessionError({
      cause,
      code: "session-rpc-failed",
      message: causeMessage(cause, "Agent RPC failed."),
      provider,
    });
  }

  static operationFailed(provider: string, cause: unknown) {
    return new AgentSessionError({
      cause,
      code: "session-operation-failed",
      message: causeMessage(cause, "Agent session operation failed."),
      provider,
    });
  }
}

function causeMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message.length > 0
    ? cause.message
    : fallback;
}
