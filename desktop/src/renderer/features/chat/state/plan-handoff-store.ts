import type { AgentRuntime } from "@shared/agents";

import { create } from "zustand";

export interface PlanHandoffRequest {
  projectId?: string | null;
  prompt: string;
  runtime: AgentRuntime;
}

interface PlanHandoffState {
  clearHandoff: () => void;
  pending: PlanHandoffRequest | null;
  requestHandoff: (request: PlanHandoffRequest) => void;
}

// Bridges the plan preview (deep in the message tree) to the workspace page,
// which owns chat creation, cache updates, and navigation. The plan preview
// pushes a handoff request here; the workspace consumes it to spawn a new
// thread that implements the plan with the chosen agent.
export const usePlanHandoffStore = create<PlanHandoffState>()((set) => ({
  clearHandoff: () => set({ pending: null }),
  pending: null,
  requestHandoff: (request) => set({ pending: request }),
}));
