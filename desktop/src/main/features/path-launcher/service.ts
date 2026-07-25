import type { PathLauncherEditorId } from "@shared/path-launcher";
import type {
  DiscoveryProbe,
  PathLauncherExecution,
  PlatformPathLauncherAdapter,
  ProcessInvocation,
  ResolvedEditor,
  ResolvedTerminal,
  SpawnProcess,
} from "./types";

export interface PathLauncherAvailability {
  editors: ReadonlyArray<Pick<ResolvedEditor, "id" | "name">>;
  systemTerminal: boolean;
}

export class PathLauncherService {
  readonly #adapter: PlatformPathLauncherAdapter;
  readonly #execution: PathLauncherExecution;
  readonly #probe: DiscoveryProbe;
  #editorsPromise: Promise<ResolvedEditor[]> | undefined;
  #terminalPromise: Promise<ResolvedTerminal | undefined> | undefined;

  constructor(options: {
    adapter: PlatformPathLauncherAdapter;
    execution: PathLauncherExecution;
    probe: DiscoveryProbe;
  }) {
    this.#adapter = options.adapter;
    this.#execution = options.execution;
    this.#probe = options.probe;
  }

  async availability(): Promise<PathLauncherAvailability> {
    const [editors, terminal] = await Promise.all([
      this.#editors(),
      this.#terminal(),
    ]);
    return {
      editors: editors.map(({ id, name }) => ({ id, name })),
      systemTerminal: terminal !== undefined,
    };
  }

  copyPath(target: string): void {
    this.#execution.copyText(target);
  }

  invalidate(): void {
    this.#editorsPromise = undefined;
    this.#terminalPromise = undefined;
  }

  async launchEditor(
    editorId: PathLauncherEditorId,
    target: string,
  ): Promise<void> {
    const editor = (await this.#editors()).find(
      (candidate) => candidate.id === editorId,
    );
    if (editor === undefined) {
      throw new Error(`${editorId} is not installed.`);
    }
    await this.#execute(editor.createInvocation(target));
  }

  async launchFileManager(target: string): Promise<void> {
    const error = await this.#execution.openPath(target);
    if (error.length > 0) throw new Error(error);
  }

  async launchSystemTerminal(target: string): Promise<void> {
    const terminal = await this.#terminal();
    if (terminal === undefined) {
      throw new Error("No supported system terminal is available.");
    }
    await this.#execute(terminal.createInvocation(target));
  }

  async prewarm(): Promise<void> {
    await this.availability();
  }

  async #editors(): Promise<ResolvedEditor[]> {
    if (this.#editorsPromise === undefined) {
      const pending = this.#adapter.discoverEditors(this.#probe);
      this.#editorsPromise = pending;
      void pending.catch(() => {
        if (this.#editorsPromise === pending) this.#editorsPromise = undefined;
      });
    }
    return this.#editorsPromise;
  }

  async #execute(invocation: ProcessInvocation): Promise<void> {
    try {
      await executeProcessInvocation(invocation, this.#execution.spawn);
    } catch (error) {
      this.invalidate();
      throw error;
    }
  }

  async #terminal(): Promise<ResolvedTerminal | undefined> {
    if (this.#terminalPromise === undefined) {
      const pending = this.#adapter.discoverTerminal(this.#probe);
      this.#terminalPromise = pending;
      void pending.catch(() => {
        if (this.#terminalPromise === pending) {
          this.#terminalPromise = undefined;
        }
      });
    }
    return this.#terminalPromise;
  }
}

export function executeProcessInvocation(
  invocation: ProcessInvocation,
  spawnProcess: SpawnProcess,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(invocation.executable, invocation.args, {
        cwd: invocation.cwd,
        detached: true,
        shell: false,
        stdio: "ignore",
      });
    } catch (error) {
      reject(error);
      return;
    }

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onSpawn = () => {
      if (invocation.awaitExit) return;
      cleanup();
      child.unref();
      resolve();
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      if (code === 0) {
        resolve();
        return;
      }
      const detail =
        code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
      reject(
        new Error(
          `Could not launch ${invocation.executable}: process ended with ${detail}.`,
        ),
      );
    };
    const cleanup = () => {
      child.removeListener("error", onError);
      child.removeListener("spawn", onSpawn);
      child.removeListener("close", onClose);
    };

    child.once("error", onError);
    child.once("spawn", onSpawn);
    if (invocation.awaitExit) child.once("close", onClose);
  });
}
