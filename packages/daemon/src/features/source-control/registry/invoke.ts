import type { ProviderOperationContext } from "@angel-engine/daemon-api/source-control";

import { errorText, redactSourceControlText } from "./redaction";

export type ProviderInvocationErrorCode =
  | "source-control/cancelled"
  | "source-control/failed"
  | "source-control/timeout";

export class ProviderInvocationError extends Error {
  readonly code: ProviderInvocationErrorCode;
  readonly providerId: string;
  readonly operation: string;
  readonly retryable: boolean;

  constructor(options: {
    code: ProviderInvocationErrorCode;
    message: string;
    operation: string;
    providerId: string;
    retryable: boolean;
  }) {
    super(options.message);
    this.name = "ProviderInvocationError";
    this.code = options.code;
    this.providerId = options.providerId;
    this.operation = options.operation;
    this.retryable = options.retryable;
  }
}

export interface ProviderInvocationOptions<A> {
  operation: string;
  providerId: string;
  run(context: ProviderOperationContext): Promise<A>;
  signal?: AbortSignal;
  timeoutMs: number;
  secrets?: readonly string[];
  log?: (message: string) => void;
}

export async function invokeProvider<A>(
  options: ProviderInvocationOptions<A>,
): Promise<A> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Provider operation timed out."));
  }, options.timeoutMs);

  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(controller.signal.reason),
      { once: true },
    );
  });

  try {
    if (options.signal?.aborted) controller.abort(options.signal.reason);
    return await Promise.race([
      Promise.resolve().then(() =>
        options.run({
          deadline: Date.now() + options.timeoutMs,
          signal: controller.signal,
        }),
      ),
      aborted,
    ]);
  } catch (cause) {
    const message = redactSourceControlText(errorText(cause), options.secrets);
    const code: ProviderInvocationErrorCode = timedOut
      ? "source-control/timeout"
      : options.signal?.aborted
        ? "source-control/cancelled"
        : "source-control/failed";
    options.log?.(`${options.providerId}.${options.operation}: ${message}`);
    throw new ProviderInvocationError({
      code,
      message,
      operation: options.operation,
      providerId: options.providerId,
      retryable: code !== "source-control/failed",
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
