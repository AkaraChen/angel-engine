import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { ChatCreationLocation } from "@angel-engine/daemon-api/chat";
import type { SetStateAction } from "react";
import type { DraftAgentConfig } from "@/app/workspace/workspace-thread-types";

import { useCallback, useReducer } from "react";

interface WorkspaceDraftState {
  agentConfigs: Partial<Record<string, DraftAgentConfig>>;
  creationLocations: Partial<Record<string, ChatCreationLocation>>;
  runtimes: Partial<Record<string, AgentRuntime>>;
  sessionIds: Partial<Record<string, number>>;
}

type WorkspaceDraftStateAction =
  | {
      action: SetStateAction<WorkspaceDraftState["agentConfigs"]>;
      type: "agentConfigs";
    }
  | {
      action: SetStateAction<WorkspaceDraftState["creationLocations"]>;
      type: "creationLocations";
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
  creationLocations: {},
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
    case "creationLocations":
      return {
        ...state,
        creationLocations: applyWorkspaceDraftSetState(
          state.creationLocations,
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
  const setDraftCreationLocations = useCallback(
    (action: SetStateAction<WorkspaceDraftState["creationLocations"]>) =>
      dispatchDraftState({ action, type: "creationLocations" }),
    [],
  );
  const setDraftRuntimes = useCallback(
    (action: SetStateAction<WorkspaceDraftState["runtimes"]>) =>
      dispatchDraftState({ action, type: "runtimes" }),
    [],
  );
  const setDraftSessionIds = useCallback(
    (action: SetStateAction<WorkspaceDraftState["sessionIds"]>) =>
      dispatchDraftState({ action, type: "sessionIds" }),
    [],
  );

  return {
    draftAgentConfigs: draftState.agentConfigs,
    draftCreationLocations: draftState.creationLocations,
    draftRuntimes: draftState.runtimes,
    draftSessionIds: draftState.sessionIds,
    setDraftAgentConfigs,
    setDraftCreationLocations,
    setDraftRuntimes,
    setDraftSessionIds,
  };
}
