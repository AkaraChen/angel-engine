import { Effect } from "effect";

/**
 * Serializes managed-worktree deletion against the chat mutations that can
 * claim a worktree path: chat creation and archived-chat restore.
 *
 * The daemon owns both sides in a single process, so an in-process mutex is
 * enough to make the ownership check inside the critical section authoritative.
 * Whichever side takes the lock first, the other observes a settled world: a
 * chat that became active blocks the delete, and a chat that lands after the
 * delete fails cwd validation because the directory is gone.
 */
const managedWorktreeLock = Effect.unsafeMakeSemaphore(1);

export function withManagedWorktreeLock<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return managedWorktreeLock.withPermits(1)(effect);
}
