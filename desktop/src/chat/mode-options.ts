import type { AgentValueOption } from "@/shared/agents";

export function findPlanModeOption(options: AgentValueOption[]) {
  return options.find((option) => isModeOption(option, "plan"));
}

export function findBuildModeOption(options: AgentValueOption[]) {
  return (
    options.find((option) => isModeOption(option, "build")) ??
    options.find((option) => isModeOption(option, "code")) ??
    options.find((option) => isModeOption(option, "default")) ??
    options.find(
      (option) => !isNoOverrideOption(option) && !isModeOption(option, "plan"),
    )
  );
}

function isModeOption(option: AgentValueOption, mode: string) {
  return (
    normalizeModeToken(option.value) === mode ||
    normalizeModeToken(option.label) === mode
  );
}

function isNoOverrideOption(option: AgentValueOption) {
  return option.label.toLowerCase() === "use default";
}

function normalizeModeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}
