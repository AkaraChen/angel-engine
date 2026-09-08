// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";

const chatTabStoreMocks = vi.hoisted(() => ({
  openChatTab: vi.fn(),
  setPowerActiveWorktree: vi.fn(),
  setPowerDraftWorktree: vi.fn(),
  setPowerWorktreeView: vi.fn(),
}));

vi.mock("@/features/chat/state/chat-tab-store", () => chatTabStoreMocks);

function chat(input: Partial<Chat> & Pick<Chat, "id">): Chat {
  return {
    archived: false,
    createdAt: "2026-08-09T00:00:00.000Z",
    cwd: null,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: input.id,
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...input,
  };
}

function workspaceModel(
  overrides: Partial<WorkspacePageModel> = {},
): WorkspacePageModel {
  return {
    activePowerWorktree: undefined,
    activeRuntime: "codex",
    chats: [],
    draftSessionCounterRef: { current: 0 },
    isDraftPage: false,
    lastOpenedTargets: {},
    location: "/project/project-1/chat-1",
    modeOverride: undefined,
    modelOverride: undefined,
    navigate: vi.fn(),
    permissionModeOverride: undefined,
    projects: [],
    reasoningEffortOverride: undefined,
    routeDraftProjectId: undefined,
    selectedChatRuntimeConfig: undefined,
    setDraftAgentConfigs: vi.fn(),
    setDraftRuntimes: vi.fn(),
    setDraftSessionIds: vi.fn(),
    ...overrides,
  } as WorkspacePageModel;
}

describe("useWorkspaceNavigation", () => {
  it("starts a standalone workspace", () => {
    const model = workspaceModel();
    const { result } = renderHook(() => useWorkspaceNavigation(model));

    act(() => result.current.createStandaloneWorkspace());

    expect(model.navigate).toHaveBeenCalledWith("/", undefined);
    expect(model.setDraftSessionIds).toHaveBeenCalledTimes(1);
  });
});
