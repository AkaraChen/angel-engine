import type { AgentValueOption } from "@/shared/agents";

const BUILD_MODE_FALLBACKS = ["build", "code", "default"];

export type ModeOptionFamily = "agent" | "permission";

export interface ModeOptionSelection {
  canSet: boolean;
  family: ModeOptionFamily;
  options: AgentValueOption[];
  value: string;
}

export interface PlanModeToggleTarget {
  buildMode: AgentValueOption;
  family: ModeOptionFamily;
  isPlanMode: boolean;
  planMode: AgentValueOption;
  targetMode: AgentValueOption;
}

export function findPlanModeToggleTarget(
  selections: ModeOptionSelection[],
): PlanModeToggleTarget | undefined {
  for (const selection of selections) {
    const planMode = findPlanModeOption(selection.options);
    const buildMode = findBuildModeOption(selection.options);
    if (!selection.canSet || !planMode || !buildMode) continue;
    const isPlanMode = selection.value === planMode.value;
    return {
      buildMode,
      family: selection.family,
      isPlanMode,
      planMode,
      targetMode: isPlanMode ? buildMode : planMode,
    };
  }
  return undefined;
}

export function findPlanModeOption(
  options: AgentValueOption[],
): AgentValueOption | undefined {
  return options.find((option) => isModeOption(option, "plan"));
}

export function findBuildModeOption(
  options: AgentValueOption[],
): AgentValueOption | undefined {
  for (const mode of BUILD_MODE_FALLBACKS) {
    const option = options.find((item) => isModeOption(item, mode));
    if (option) return option;
  }

  return options.find(
    (option) => !isNoOverrideOption(option) && !isModeOption(option, "plan"),
  );
}

function isModeOption(option: AgentValueOption, mode: string): boolean {
  return (
    normalizeModeToken(option.value) === mode ||
    normalizeModeToken(option.label) === mode
  );
}

function isNoOverrideOption(option: AgentValueOption): boolean {
  return option.label.toLowerCase() === "use default";
}

function normalizeModeToken(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}
