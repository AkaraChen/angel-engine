import type { ManagedRuntime } from "effect";
import type { ChatEngine } from "../features/chat/engine-runtime";
import type { TerminalService } from "../features/terminal/manager";
import type { ProcessRegistryService } from "../processes";
import type { Db } from "./db";
import type { DaemonError } from "./errors";

import { Cause, Effect, Exit, Option } from "effect";

export type DaemonServices =
  | ChatEngine
  | Db
  | ProcessRegistryService
  | TerminalService;

export type DaemonRuntime = ManagedRuntime.ManagedRuntime<
  DaemonServices,
  DaemonError
>;

/**
 * Runs a daemon effect for an HTTP handler. Typed failures re-throw as the
 * `DaemonError` itself so the Hono `onError` hook can map code and status;
 * defects surface as their underlying cause.
 */
export async function runDaemonApi<A>(
  runtime: DaemonRuntime,
  effect: Effect.Effect<A, DaemonError, DaemonServices>,
): Promise<A> {
  const exit = await runtime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) throw failure.value;
  throw Cause.squash(exit.cause);
}

/** Variant of `runDaemonApi` for effects that cannot fail. */
export function runDaemon<A>(
  runtime: DaemonRuntime,
  effect: Effect.Effect<A, never, DaemonServices>,
): Promise<A> {
  return runtime.runPromise(effect);
}
