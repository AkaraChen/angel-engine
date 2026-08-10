import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";
import type {
  TranscriptDensity,
  TranscriptDensityByMode,
} from "@/features/chat/transcript-density";
import { create } from "zustand";
import {
  densityForWorkspaceMode,
  sanitizeTranscriptDensityByMode,
} from "@/features/chat/transcript-density";

const transcriptDensityStorageKey = "angel-engine.transcript-density.v1";

interface TranscriptDensityState {
  densities: TranscriptDensityByMode;
  densityFor: (workspaceMode: WorkspaceMode) => TranscriptDensity;
  setDensity: (
    workspaceMode: WorkspaceMode,
    density: TranscriptDensity,
  ) => void;
}

const useTranscriptDensityStore = create<TranscriptDensityState>()(
  (set, get) => ({
    densities: readTranscriptDensities(),
    densityFor: (workspaceMode) =>
      densityForWorkspaceMode(get().densities, workspaceMode),
    setDensity: (workspaceMode, density) => {
      const current = get().densities;
      if (current[workspaceMode] === density) return;

      const densities = { ...current, [workspaceMode]: density };
      writeTranscriptDensities(densities);
      set({ densities });
    },
  }),
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== transcriptDensityStorageKey) return;

    useTranscriptDensityStore.setState({
      densities: parseStoredTranscriptDensities(event.newValue),
    });
  });
}

function readTranscriptDensities(): TranscriptDensityByMode {
  try {
    return parseStoredTranscriptDensities(
      window.localStorage.getItem(transcriptDensityStorageKey),
    );
  } catch {
    return sanitizeTranscriptDensityByMode(undefined);
  }
}

function writeTranscriptDensities(densities: TranscriptDensityByMode) {
  try {
    window.localStorage.setItem(
      transcriptDensityStorageKey,
      JSON.stringify(sanitizeTranscriptDensityByMode(densities)),
    );
  } catch {
    // Preference remains live for this window when storage is unavailable.
  }
}

function parseStoredTranscriptDensities(
  raw: string | null,
): TranscriptDensityByMode {
  if (raw === null || raw === "") {
    return sanitizeTranscriptDensityByMode(undefined);
  }
  try {
    return sanitizeTranscriptDensityByMode(JSON.parse(raw));
  } catch {
    return sanitizeTranscriptDensityByMode(undefined);
  }
}

export { useTranscriptDensityStore };
