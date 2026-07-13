import claudeIconSvg from "@lobehub/icons-static-svg/icons/claudecode.svg?raw";
import clineIconSvg from "@lobehub/icons-static-svg/icons/cline.svg?raw";
import codexIconSvg from "@lobehub/icons-static-svg/icons/codex.svg?raw";
import copilotIconSvg from "@lobehub/icons-static-svg/icons/copilot.svg?raw";
import geminiIconSvg from "@lobehub/icons-static-svg/icons/geminicli.svg?raw";
import kimiIconSvg from "@lobehub/icons-static-svg/icons/kimi.svg?raw";
import opencodeIconSvg from "@lobehub/icons-static-svg/icons/opencode.svg?raw";
import qoderIconSvg from "@lobehub/icons-static-svg/icons/qoder.svg?raw";

import piIconSvg from "./pi-coding-agent.svg?raw";

/**
 * Built-in runtime brand icons, mirroring the desktop mapping in
 * `desktop/src/renderer/features/agents/agent-runtime-icons.ts` (LobeHub static
 * SVGs, plus the local Pi mark). Custom `custom:*` runtimes have no brand icon
 * and fall back to a generic glyph at the call site.
 */
const builtinAgentIconSvg: Record<string, string> = {
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
  runtime: string | null | undefined,
): string | undefined {
  if (runtime === null || runtime === undefined) return undefined;
  return builtinAgentIconSvg[runtime];
}
