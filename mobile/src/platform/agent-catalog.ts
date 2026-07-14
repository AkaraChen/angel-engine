/**
 * Static agent catalog for the mobile composer.
 *
 * The desktop reads the enabled runtimes and their model/reasoning options from
 * the engine (`ChatRuntimeConfig`), but the mobile bundle has no engine access.
 * This mirrors the built-in `AGENT_OPTIONS` from `desktop/src/shared/agents.ts`
 * so the composer can offer the same runtimes. Model and reasoning options come
 * from the daemon's runtime-config endpoint.
 */

export interface AgentOption {
  id: string;
  label: string;
}

export const AGENT_OPTIONS: AgentOption[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "kimi", label: "Kimi" },
  { id: "opencode", label: "OpenCode" },
  { id: "qoder", label: "Qoder" },
  { id: "cline", label: "Cline" },
  { id: "pi", label: "Pi" },
];

export const DEFAULT_AGENT_RUNTIME = "claude";

export function agentLabel(runtime: string | null | undefined): string {
  if (runtime === null || runtime === undefined || runtime.length === 0) {
    return "Agent";
  }
  return AGENT_OPTIONS.find((agent) => agent.id === runtime)?.label ?? runtime;
}
