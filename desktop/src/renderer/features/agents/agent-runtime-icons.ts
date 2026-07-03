import type { BuiltinAgentRuntime } from "@shared/agents";
import claudeIconSvg from "@lobehub/icons-static-svg/icons/claudecode.svg?raw";
import clineIconSvg from "@lobehub/icons-static-svg/icons/cline.svg?raw";
import codexIconSvg from "@lobehub/icons-static-svg/icons/codex.svg?raw";
import copilotIconSvg from "@lobehub/icons-static-svg/icons/copilot.svg?raw";
import geminiIconSvg from "@lobehub/icons-static-svg/icons/geminicli.svg?raw";
import kimiIconSvg from "@lobehub/icons-static-svg/icons/kimi.svg?raw";
import opencodeIconSvg from "@lobehub/icons-static-svg/icons/opencode.svg?raw";
import qoderIconSvg from "@lobehub/icons-static-svg/icons/qoder.svg?raw";
import piIconSvg from "./pi-coding-agent.svg?raw";

import { AGENT_OPTIONS, isBuiltinAgentRuntime } from "@shared/agents";
import is from "@sindresorhus/is";

const builtinAgentIconSvg: Record<BuiltinAgentRuntime, string> = {
  claude: claudeIconSvg,
  cline: clineIconSvg,
  codex: codexIconSvg,
  copilot: copilotIconSvg,
  gemini: geminiIconSvg,
  kimi: kimiIconSvg,
  opencode: opencodeIconSvg,
  pi: piIconSvg,
  qoder: qoderIconSvg,
};

export function agentRuntimeIconSvg(
  runtime?: string | null,
): string | undefined {
  if (!isBuiltinAgentRuntime(runtime)) return undefined;
  return builtinAgentIconSvg[runtime];
}

export function agentRuntimeLabel(runtime?: string | null): string {
  if (!is.nonEmptyString(runtime)) return "Agent";
  return AGENT_OPTIONS.find((agent) => agent.id === runtime)?.label ?? runtime;
}
