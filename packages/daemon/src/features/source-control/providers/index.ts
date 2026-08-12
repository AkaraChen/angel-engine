import { githubPlugin } from "./github";

import { SourceControlRegistry } from "../registry/registry";

export function createSourceControlRegistry() {
  const registry = new SourceControlRegistry();
  registry.register(githubPlugin);
  return registry;
}
