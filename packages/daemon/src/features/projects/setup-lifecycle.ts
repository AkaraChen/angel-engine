import type { ProjectSetupLifecycleView } from "@angel-engine/daemon-api/projects";

import path from "node:path";
import {
  executeProjectLifecycle,
  readProjectLifecycleLog,
  readProjectLifecycleSnapshot,
} from "./lifecycle";

interface SetupRegistration {
  approvedDigest: string;
  controller?: AbortController;
  continued: boolean;
  discarded: boolean;
  projectRoot: string;
  revision: number;
  running?: Promise<void>;
  waiters: Set<() => void>;
}

export class ProjectSetupLifecycleCoordinator {
  readonly #registrations = new Map<string, SetupRegistration>();

  start(input: {
    approvedDigest: string;
    projectRoot: string;
    worktreePath: string;
  }): void {
    const key = path.resolve(input.worktreePath);
    const registration =
      this.#registrations.get(key) ??
      ({
        approvedDigest: input.approvedDigest,
        continued: false,
        discarded: false,
        projectRoot: input.projectRoot,
        revision: 0,
        waiters: new Set(),
      } satisfies SetupRegistration);
    registration.approvedDigest = input.approvedDigest;
    registration.projectRoot = input.projectRoot;
    registration.continued = false;
    registration.discarded = false;
    this.#registrations.set(key, registration);
    this.#launch(key, registration);
  }

  restore(input: {
    approvedDigest: string;
    projectRoot: string;
    worktreePath: string;
  }): void {
    const key = path.resolve(input.worktreePath);
    if (this.#registrations.has(key)) return;
    this.#registrations.set(key, {
      approvedDigest: input.approvedDigest,
      continued: false,
      discarded: false,
      projectRoot: input.projectRoot,
      revision: 0,
      waiters: new Set(),
    });
  }

  retry(
    worktreePath: string,
    approval: { approvedDigest: string; projectRoot: string },
  ): void {
    const key = path.resolve(worktreePath);
    const registration = this.#require(key);
    if (registration.running !== undefined) return;
    registration.approvedDigest = approval.approvedDigest;
    registration.projectRoot = approval.projectRoot;
    registration.continued = false;
    registration.discarded = false;
    this.#launch(key, registration);
  }

  continue(worktreePath: string): void {
    const registration = this.#require(path.resolve(worktreePath));
    registration.continued = true;
    this.#notify(registration);
  }

  async cancel(worktreePath: string): Promise<void> {
    const registration = this.#registrations.get(path.resolve(worktreePath));
    registration?.controller?.abort();
    await registration?.running;
  }

  async discard(worktreePath: string): Promise<void> {
    const registration = this.#registrations.get(path.resolve(worktreePath));
    if (registration === undefined) return;
    registration.discarded = true;
    registration.controller?.abort();
    this.#notify(registration);
    await registration.running;
  }

  async waitUntilReady(
    worktreePath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const key = path.resolve(worktreePath);
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new Error("Run cancelled.");
      const registration = this.#registrations.get(key);
      if (registration === undefined) return;
      if (registration.discarded) throw new Error("Workspace was discarded.");
      if (registration.continued) return;
      const snapshot = await readProjectLifecycleSnapshot(key);
      if (registration.discarded) throw new Error("Workspace was discarded.");
      if (registration.continued) return;
      if (snapshot.setup.status === "ready") return;
      if (registration.running !== undefined) {
        await this.#abortable(registration.running, signal);
        continue;
      }
      const revision = registration.revision;
      if (registration.discarded) throw new Error("Workspace was discarded.");
      if (registration.continued) return;
      let wake!: () => void;
      const changed = new Promise<void>((resolve) => {
        wake = () => {
          if (registration.revision === revision) return;
          resolve();
        };
        registration.waiters.add(wake);
      });
      try {
        await this.#abortable(changed, signal);
      } finally {
        registration.waiters.delete(wake);
      }
    }
  }

  async view(worktreePath: string): Promise<ProjectSetupLifecycleView> {
    const key = path.resolve(worktreePath);
    const registration = this.#registrations.get(key);
    return {
      continued: registration?.continued ?? false,
      log: await readProjectLifecycleLog(key, "setup"),
      running: registration?.running !== undefined,
      snapshot: await readProjectLifecycleSnapshot(key),
    };
  }

  #launch(key: string, registration: SetupRegistration): void {
    if (registration.running !== undefined) return;
    const controller = new AbortController();
    registration.controller = controller;
    const running = executeProjectLifecycle("setup", {
      approvedDigest: registration.approvedDigest,
      projectRoot: registration.projectRoot,
      signal: controller.signal,
      worktreePath: key,
    }).then(
      () => undefined,
      () => undefined,
    );
    registration.running = running;
    void running.finally(() => {
      if (registration.running === running) {
        registration.running = undefined;
        registration.controller = undefined;
        this.#notify(registration);
      }
    });
    this.#notify(registration);
  }

  #notify(registration: SetupRegistration): void {
    registration.revision += 1;
    for (const wake of registration.waiters) wake();
  }

  #require(key: string): SetupRegistration {
    const registration = this.#registrations.get(key);
    if (registration === undefined) {
      throw new Error("No setup lifecycle is registered for this workspace.");
    }
    return registration;
  }

  async #abortable(
    promise: Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal === undefined) return promise;
    if (signal.aborted) throw signal.reason ?? new Error("Run cancelled.");
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(signal.reason ?? new Error("Run cancelled."));
      };
      signal.addEventListener("abort", abort, { once: true });
      void promise.then(
        () => {
          signal.removeEventListener("abort", abort);
          resolve();
        },
        (cause) => {
          signal.removeEventListener("abort", abort);
          reject(cause);
        },
      );
    });
  }
}

export const projectSetupLifecycle = new ProjectSetupLifecycleCoordinator();
