import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { SetStateAction } from "react";
import type { DraftAgentConfig } from "@/app/workspace/workspace-thread-types";

import { useCallback, useReducer } from "react";

interface WorkspaceDraftState {
  agentConfigs: Partial<Record<string, DraftAgentConfig>>;
  initialPrompts: Partial<Record<string, string>>;
  runtimes: Partial<Record<string, AgentRuntime>>;
  sessionIds: Partial<Record<string, number>>;
}

type WorkspaceDraftStateAction =
  | {
      action: SetStateAction<WorkspaceDraftState["initialPrompts"]>;
      type: "initialPrompts";
    }
  | {
      action: SetStateAction<WorkspaceDraftState["agentConfigs"]>;
      type: "agentConfigs";
    }
  | {
      action: SetStateAction<WorkspaceDraftState["runtimes"]>;
      type: "runtimes";
    }
  | {
      action: SetStateAction<WorkspaceDraftState["sessionIds"]>;
      type: "sessionIds";
    };

const emptyWorkspaceDraftState: WorkspaceDraftState = {
  agentConfigs: {},
  initialPrompts: {},
  runtimes: {},
  sessionIds: {},
};

function applyWorkspaceDraftSetState<T>(
  current: T,
  action: SetStateAction<T>,
): T {
  return typeof action === "function"
    ? (action as (current: T) => T)(current)
    : action;
}

function workspaceDraftStateReducer(
  state: WorkspaceDraftState,
  action: WorkspaceDraftStateAction,
): WorkspaceDraftState {
  switch (action.type) {
    case "agentConfigs":
      return {
        ...state,
        agentConfigs: applyWorkspaceDraftSetState(
          state.agentConfigs,
          action.action,
        ),
      };
    case "initialPrompts":
      return {
        ...state,
        initialPrompts: applyWorkspaceDraftSetState(
          state.initialPrompts,
          action.action,
        ),
      };
    case "runtimes":
      return {
        ...state,
        runtimes: applyWorkspaceDraftSetState(state.runtimes, action.action),
      };
    case "sessionIds":
      return {
        ...state,
        sessionIds: applyWorkspaceDraftSetState(
          state.sessionIds,
          action.action,
        ),
      };
  }
}

export function useWorkspaceDraftState() {
  const [draftState, dispatchDraftState] = useReducer(
    workspaceDraftStateReducer,
    emptyWorkspaceDraftState,
  );
  const setDraftAgentConfigs = useCallback(
    (action: SetStateAction<WorkspaceDraftState["agentConfigs"]>) =>
      dispatchDraftState({ action, type: "agentConfigs" }),
    [],
  );
  const setDraftRuntimes = useCallback(
    (action: SetStateAction<WorkspaceDraftState["runtimes"]>) =>
      dispatchDraftState({ action, type: "runtimes" }),
    [],
  );
  const setDraftInitialPrompts = useCallback(
    (action: SetStateAction<WorkspaceDraftState["initialPrompts"]>) =>
      dispatchDraftState({ action, type: "initialPrompts" }),
    [],
  );
  const setDraftSessionIds = useCallback(
    (action: SetStateAction<WorkspaceDraftState["sessionIds"]>) =>
      dispatchDraftState({ action, type: "sessionIds" }),
    [],
  );

  return {
    draftAgentConfigs: draftState.agentConfigs,
    draftInitialPrompts: draftState.initialPrompts,
    draftRuntimes: draftState.runtimes,
    draftSessionIds: draftState.sessionIds,
    setDraftAgentConfigs,
    setDraftInitialPrompts,
    setDraftRuntimes,
    setDraftSessionIds,
  };
}
