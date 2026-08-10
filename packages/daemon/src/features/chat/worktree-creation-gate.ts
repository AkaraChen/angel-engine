export type WorktreeCreationGateState = "creating" | "failed" | null;

/** Keeps a queued run parked across a retryable worktree creation failure. */
export class WorktreeCreationGate {
  readonly #revisions = new Map<string, number>();
  readonly #waiters = new Map<string, Set<() => void>>();

  changed(chatId: string): void {
    this.#revisions.set(chatId, (this.#revisions.get(chatId) ?? 0) + 1);
    const waiters = this.#waiters.get(chatId);
    if (waiters === undefined) return;
    this.#waiters.delete(chatId);
    for (const resolve of waiters) resolve();
  }

  async waitUntilReady(
    chatId: string,
    inspect: () => Promise<WorktreeCreationGateState>,
    signal?: AbortSignal,
  ): Promise<void> {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error("Run cancelled.");
      }
      const revision = this.#revisions.get(chatId) ?? 0;
      if ((await inspect()) === null) return;
      await this.#waitForChange(chatId, revision, signal);
    }
  }

  #waitForChange(
    chatId: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Run cancelled."));
        return;
      }
      const finish = () => {
        signal?.removeEventListener("abort", abort);
        this.#waiters.get(chatId)?.delete(finish);
        resolve();
      };
      const abort = () => {
        this.#waiters.get(chatId)?.delete(finish);
        reject(signal?.reason ?? new Error("Run cancelled."));
      };
      const waiters = this.#waiters.get(chatId) ?? new Set();
      waiters.add(finish);
      this.#waiters.set(chatId, waiters);
      signal?.addEventListener("abort", abort, { once: true });
      if ((this.#revisions.get(chatId) ?? 0) !== revision) finish();
    });
  }
}
