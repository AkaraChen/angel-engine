import { azureDevOpsPlugin } from "./azure";
import { githubPlugin } from "./github";
import { gitlabPlugin } from "./gitlab";

import { SourceControlRegistry } from "../registry/registry";

export function createSourceControlRegistry() {
  const registry = new SourceControlRegistry();
  registry.register(githubPlugin);
  registry.register(gitlabPlugin);
  registry.register(azureDevOpsPlugin);
  return registry;
}
