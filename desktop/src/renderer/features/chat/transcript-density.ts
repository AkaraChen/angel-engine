import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";

/**
 * Transcript projection density. Raw events stay stored; this only changes how
 * the renderer folds tool / reasoning detail.
 *
 * - compact: tool rows stay collapsed by default (summary only).
 * - normal: current auto-open when nothing follows the tool group/row.
 * - debug: tool detail stays open by default for inspection.
 */
export type TranscriptDensity = "compact" | "normal" | "debug";

export const TRANSCRIPT_DENSITY_VALUES = [
  "compact",
  "normal",
  "debug",
] as const satisfies readonly TranscriptDensity[];

export type TranscriptDensityByMode = Record<WorkspaceMode, TranscriptDensity>;

export const DEFAULT_TRANSCRIPT_DENSITY_BY_MODE = {
  chat: "compact",
  power: "normal",
  work: "normal",
} as const satisfies TranscriptDensityByMode;

/** Whether tool detail should open when the user has not toggled it manually. */
export function defaultToolDetailsOpen(
  density: TranscriptDensity,
  hasTextAfter: boolean,
): boolean {
  switch (density) {
    case "compact":
      return false;
    case "debug":
      return true;
    case "normal":
      return !hasTextAfter;
  }
}

/** Whether a reasoning block should force-open (debug) regardless of stream state. */
export function prefersReasoningOpen(density: TranscriptDensity): boolean {
  return density === "debug";
}

export function sanitizeTranscriptDensity(
  value: unknown,
): TranscriptDensity | undefined {
  return value === "compact" || value === "normal" || value === "debug"
    ? value
    : undefined;
}

export function sanitizeTranscriptDensityByMode(
  value: unknown,
): TranscriptDensityByMode {
  if (value === null || typeof value !== "object") {
    return { ...DEFAULT_TRANSCRIPT_DENSITY_BY_MODE };
  }

  const record = value as Partial<Record<string, unknown>>;
  return {
    chat:
      sanitizeTranscriptDensity(record.chat) ??
      DEFAULT_TRANSCRIPT_DENSITY_BY_MODE.chat,
    power:
      sanitizeTranscriptDensity(record.power) ??
      DEFAULT_TRANSCRIPT_DENSITY_BY_MODE.power,
    work:
      sanitizeTranscriptDensity(record.work) ??
      DEFAULT_TRANSCRIPT_DENSITY_BY_MODE.work,
  };
}

export function densityForWorkspaceMode(
  densities: TranscriptDensityByMode,
  workspaceMode: WorkspaceMode,
): TranscriptDensity {
  return densities[workspaceMode] ?? DEFAULT_TRANSCRIPT_DENSITY_BY_MODE.chat;
}
