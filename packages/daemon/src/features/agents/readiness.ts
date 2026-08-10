import type {
  AgentOption,
  AgentReadiness,
  AgentReadinessStatus,
  AgentRuntime,
  CustomAgent,
} from "@angel-engine/daemon-api/agents";

/**
 * Pure mapping from a binary presence probe into the closed readiness set.
 * Auth-required is reserved for probes that already normalized that signal;
 * this module never inspects provider names or raw wire payloads.
 */
export function readinessFromBinaryPresence(input: {
  available: boolean;
  command: string;
  probeError?: string;
}): AgentReadiness {
  if (input.probeError) {
    return {
      detail: input.probeError,
      status: "error",
    };
  }
  if (!input.available) {
    return {
      detail: `Command not found: ${input.command}`,
      status: "unavailable",
    };
  }
  return {
    detail: input.command,
    status: "ready",
  };
}

/**
 * Custom agents that declare needAuth start as authentication-required when
 * the binary is present; autoAuthenticate does not clear that until a verified
 * probe (future) reports ready.
 */
export function readinessForCustomAgent(input: {
  agent: CustomAgent;
  available: boolean;
  probeError?: string;
}): AgentReadiness {
  const base = readinessFromBinaryPresence({
    available: input.available,
    command: input.agent.command,
    probeError: input.probeError,
  });
  if (base.status === "ready" && input.agent.needAuth) {
    return {
      detail: base.detail,
      status: "authentication-required",
    };
  }
  return base;
}

export function withReadiness(
  agent: AgentOption,
  readiness: AgentReadiness,
): AgentOption {
  return { ...agent, readiness };
}

export function isAgentReadinessStatus(
  value: unknown,
): value is AgentReadinessStatus {
  return (
    value === "ready" ||
    value === "authentication-required" ||
    value === "unavailable" ||
    value === "checking" ||
    value === "error"
  );
}

/** Runtime-agnostic recovery action id for settings UI. */
export type AgentReadinessAction =
  | "authenticate"
  | "test-again"
  | "edit-command"
  | "view-details";

export function recoveryActionsForReadiness(
  status: AgentReadinessStatus,
  kind: "builtin" | "custom",
): AgentReadinessAction[] {
  switch (status) {
    case "ready":
      return ["view-details"];
    case "authentication-required":
      return ["authenticate", "view-details"];
    case "unavailable":
      return kind === "custom"
        ? ["edit-command", "test-again", "view-details"]
        : ["test-again", "view-details"];
    case "checking":
      return [];
    case "error":
      return kind === "custom"
        ? ["edit-command", "test-again", "view-details"]
        : ["test-again", "view-details"];
  }
}

export type { AgentRuntime };
