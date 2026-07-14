/**
 * Static agent + reasoning catalog for the mobile composer.
 *
 * The desktop reads the enabled runtimes and their model/reasoning options from
 * the engine (`ChatRuntimeConfig`), but the mobile bundle has no engine access.
 * This mirrors the built-in `AGENT_OPTIONS` from `desktop/src/shared/agents.ts`
 * so the composer can offer the same runtimes; model and reasoning specifics
 * remain runtime-driven and are entered/selected loosely until the daemon
 * exposes a runtime-config endpoint.
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

export interface ReasoningEffortOption {
  value: string;
  labelKey: `createChat.reasoningOptions.${"default" | "minimal" | "low" | "medium" | "high"}`;
}

/**
 * Common reasoning levels. Empty value means "runtime default" (no override),
 * matching the desktop convention of using a missing value for no override.
 * Labels are translation keys resolved by the composer at render time.
 */
export const REASONING_EFFORT_OPTIONS: ReasoningEffortOption[] = [
  { value: "", labelKey: "createChat.reasoningOptions.default" },
  { value: "minimal", labelKey: "createChat.reasoningOptions.minimal" },
  { value: "low", labelKey: "createChat.reasoningOptions.low" },
  { value: "medium", labelKey: "createChat.reasoningOptions.medium" },
  { value: "high", labelKey: "createChat.reasoningOptions.high" },
];
