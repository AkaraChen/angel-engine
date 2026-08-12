import type { ShepherdStartInput } from "@angel-engine/daemon-api/shepherd";
import type { ApiClient } from "@/platform/api-client";

export type ShepherdTarget = Omit<ShepherdStartInput, "chatId" | "maxRounds">;

/** Resolve a provider URL through the active source-control provider. */
export async function resolveShepherdTarget({
  api,
  projectPath,
  url,
}: {
  api: ApiClient;
  projectPath: string;
  url: string;
}): Promise<ShepherdTarget | null> {
  const resolved = await api.sourceControl.resolveLink(projectPath, url);
  if (!("source" in resolved)) return null;
  if (resolved.number === null || resolved.number <= 0) return null;
  const owner = resolved.repository.namespace.join("/");
  if (owner.length === 0 || resolved.repository.name.length === 0) return null;
  return {
    owner,
    prNumber: resolved.number,
    repo: resolved.repository.name,
  };
}
