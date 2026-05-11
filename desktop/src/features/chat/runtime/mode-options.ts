import type { AgentValueOption } from "@/shared/agents";

const BUILD_MODE_FALLBACKS = ["build", "code", "default"];

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
