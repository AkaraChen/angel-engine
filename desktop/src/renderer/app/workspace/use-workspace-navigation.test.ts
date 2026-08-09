// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";
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
    setWorkspaceMode: vi.fn(),
    workspaceMode: "work",
    ...overrides,
  } as WorkspacePageModel;
}

describe("useWorkspaceNavigation", () => {
  it("starts a standalone workspace in chat mode", () => {
    const model = workspaceModel();
    const { result } = renderHook(() => useWorkspaceNavigation(model));

    act(() => result.current.createStandaloneWorkspace());

    expect(model.setWorkspaceMode).toHaveBeenCalledWith("chat");
    expect(model.navigate).toHaveBeenCalledWith("/", undefined);
    expect(model.setDraftSessionIds).toHaveBeenCalledTimes(1);
  });

  it("jumps between standalone and project session modes", () => {
    const setWorkspaceMode = vi.fn();
    const navigate = vi.fn();
    const model = workspaceModel({ navigate, setWorkspaceMode });
    const { result } = renderHook(() => useWorkspaceNavigation(model));

    act(() => result.current.openChatFromFleet(chat({ id: "standalone" })));
    expect(setWorkspaceMode).toHaveBeenCalledWith("chat");
    expect(navigate).toHaveBeenCalledWith("/chat/standalone");

    const chatModeModel = workspaceModel({
      location: "/chat/standalone",
      navigate,
      setWorkspaceMode,
      workspaceMode: "chat",
    });
    const { result: chatModeResult } = renderHook(() =>
      useWorkspaceNavigation(chatModeModel),
    );
    act(() =>
      chatModeResult.current.openChatFromFleet(
        chat({ id: "project-chat", projectId: "project-1" }),
      ),
    );

    expect(setWorkspaceMode).toHaveBeenCalledWith("work");
    expect(navigate).toHaveBeenCalledWith("/project/project-1/project-chat");
  });
});
