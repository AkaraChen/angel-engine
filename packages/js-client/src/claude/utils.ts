import type {
  Options as ClaudeQueryOptions,
  EffortLevel,
  PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeElicitationResponse, EngineEventJson } from "./types.js";
import { EngineEventElicitationDecision } from "@angel-engine/client-napi";

const CLAUDE_PERMISSION_MODE_VISIBILITY = {
  default: true,
  acceptEdits: true,
  plan: true,
  dontAsk: true,
  auto: true,
  bypassPermissions: false,
} as const satisfies Record<PermissionMode, boolean>;

const CLAUDE_EFFORT_LEVELS = {
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
} as const satisfies Record<EffortLevel, true>;

export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function claudePermissionModeIds(): PermissionMode[] {
  return (
    Object.keys(CLAUDE_PERMISSION_MODE_VISIBILITY) as PermissionMode[]
  ).filter((mode) => CLAUDE_PERMISSION_MODE_VISIBILITY[mode]);
}

export function claudeEffortLevelIds(): EffortLevel[] {
  return Object.keys(CLAUDE_EFFORT_LEVELS) as EffortLevel[];
}

export function labelFromValue(value: string): string {
  const spaced = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "xhigh") return "XHigh";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function compactEvents(
  events: Array<EngineEventJson | undefined>,
): EngineEventJson[] {
  return events.filter((event): event is EngineEventJson => Boolean(event));
}

export function permissionDecision(
  response: ClaudeElicitationResponse,
): unknown {
  switch (response.type) {
    case "allow":
      return EngineEventElicitationDecision.Allow;
    case "allowForSession":
      return EngineEventElicitationDecision.AllowForSession;
    case "answers":
      return {
        [EngineEventElicitationDecision.Answers]: response.answers.map(
          (answer) => ({
            id: answer.id,
            value: answer.value,
          }),
        ),
      };
    case "cancel":
      return EngineEventElicitationDecision.Cancel;
    default:
      return EngineEventElicitationDecision.Deny;
  }
}

export function normalizeClaudeMode(
  mode: string | null | undefined,
): PermissionMode {
  return isClaudePermissionMode(mode) ? mode : "default";
}

export function claudeEffort(
  effort: string | null | undefined,
): NonNullable<ClaudeQueryOptions["effort"]> | undefined {
  return isClaudeEffortLevel(effort) ? effort : undefined;
}

function isClaudePermissionMode(
  value: string | null | undefined,
): value is PermissionMode {
  return (
    typeof value === "string" && value in CLAUDE_PERMISSION_MODE_VISIBILITY
  );
}

function isClaudeEffortLevel(
  value: string | null | undefined,
): value is EffortLevel {
  return typeof value === "string" && value in CLAUDE_EFFORT_LEVELS;
}
