import type {
  ProjectProviderConfig,
  ProviderHostMapping,
} from "@angel-engine/daemon-api/source-control";

import { SourceControlRegistry } from "./registry";
import { watchSourceControlProject } from "./watch";

export class SourceControlCoordinator {
  readonly registry: SourceControlRegistry;
  readonly #watchers = new Map<string, () => void>();

  constructor(registry = new SourceControlRegistry()) {
    this.registry = registry;
  }

  async activate(options: {
    projectPath: string;
    providerConfig?: ProjectProviderConfig;
    hostMappings?: readonly ProviderHostMapping[];
    signal?: AbortSignal;
  }) {
    await this.#watch(options.projectPath);
    return this.registry.activate(options);
  }

  invalidate(projectPath: string) {
    this.registry.invalidate(projectPath);
  }

  invalidateAll() {
    this.registry.invalidateAll();
  }

  close() {
    for (const close of this.#watchers.values()) close();
    this.#watchers.clear();
  }

  async #watch(projectPath: string) {
    if (this.#watchers.has(projectPath)) return;
    const close = await watchSourceControlProject(projectPath, () =>
      this.registry.invalidate(projectPath),
    );
    this.#watchers.set(projectPath, close);
  }
}
