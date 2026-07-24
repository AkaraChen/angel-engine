import type { DaemonRuntimeConfigOption } from "@/platform/chat-types";

const BUILD_MODE_FALLBACKS = ["build", "code", "default"];

type ModeOptionFamily = "agent" | "permission";

export interface ModeOptionSelection {
  canSet: boolean;
  family: ModeOptionFamily;
  options: DaemonRuntimeConfigOption[];
  value: string;
}

export interface PlanModeToggleTarget {
  buildMode: DaemonRuntimeConfigOption;
  family: ModeOptionFamily;
  isPlanMode: boolean;
  planMode: DaemonRuntimeConfigOption;
  targetMode: DaemonRuntimeConfigOption;
}

/**
 * Pick the first mode/permission family that can toggle between plan and build.
 * Mirrors desktop `findPlanModeToggleTarget` so Claude (permission modes) and
 * agents that expose agent modes both work without hard-coding a family.
 */
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

function findPlanModeOption(
  options: DaemonRuntimeConfigOption[],
): DaemonRuntimeConfigOption | undefined {
  return options.find((option) => isModeOption(option, "plan"));
}

function findBuildModeOption(
  options: DaemonRuntimeConfigOption[],
): DaemonRuntimeConfigOption | undefined {
  for (const mode of BUILD_MODE_FALLBACKS) {
    const option = options.find((item) => isModeOption(item, mode));
    if (option) return option;
  }

  return options.find(
    (option) => !isNoOverrideOption(option) && !isModeOption(option, "plan"),
  );
}

function isModeOption(
  option: DaemonRuntimeConfigOption,
  mode: string,
): boolean {
  return (
    normalizeModeToken(option.value) === mode ||
    normalizeModeToken(option.label) === mode
  );
}

function isNoOverrideOption(option: DaemonRuntimeConfigOption): boolean {
  return option.label.toLowerCase() === "use default";
}

function normalizeModeToken(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}
