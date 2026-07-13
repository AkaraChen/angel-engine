import { fileURLToPath } from "node:url";

export function piAgentEntryPath(): string {
  return fileURLToPath(new URL("./pi-agent-entry.js", import.meta.url));
}
