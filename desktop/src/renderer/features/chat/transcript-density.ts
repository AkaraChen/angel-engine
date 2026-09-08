/**
 * Transcript projection density. Raw events stay stored; this only changes how
 * the renderer folds tool detail.
 *
 * Fixed for the unified chat transcript — not a user preference:
 */
export type TranscriptDensity = "compact" | "normal";

/** Density is fully determined by the current workspace mode. */
export function densityForTranscript(): TranscriptDensity {
  return "compact";
}

/** Whether tool detail should open when the user has not toggled it manually. */
export function defaultToolDetailsOpen(
  density: TranscriptDensity,
  hasTextAfter: boolean,
): boolean {
  return density === "compact" ? false : !hasTextAfter;
}
