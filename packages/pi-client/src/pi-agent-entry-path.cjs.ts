import path from "node:path";

export function piAgentEntryPath(): string {
  return path.join(__dirname, "pi-agent-entry.js");
}
