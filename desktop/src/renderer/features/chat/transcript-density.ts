import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";

/**
 * Transcript projection density. Raw events stay stored; this only changes how
 * the renderer folds tool detail.
 *
 * Fixed by workspace mode — not a user preference:
 * - chat → compact (tool rows stay collapsed by default; expand one at a time)
 * - work / power → normal (auto-open when nothing follows the tool group/row)
 */
export type TranscriptDensity = "compact" | "normal";

/** Density is fully determined by the current workspace mode. */
export function densityForWorkspaceMode(
  workspaceMode: WorkspaceMode,
): TranscriptDensity {
  return workspaceMode === "chat" ? "compact" : "normal";
}

/** Whether tool detail should open when the user has not toggled it manually. */
export function defaultToolDetailsOpen(
  density: TranscriptDensity,
  hasTextAfter: boolean,
): boolean {
  return density === "compact" ? false : !hasTextAfter;
}
