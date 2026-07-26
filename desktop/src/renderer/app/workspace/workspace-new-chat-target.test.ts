import type { Project } from "@angel-engine/daemon-api/projects";

import { describe, expect, it } from "vitest";

import { resolveWorkspaceNewChatTarget } from "./workspace-new-chat-target";

const PROJECT: Project = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "project-1",
  name: "Angel",
  path: "/code/angel-engine",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Project;

describe("resolveWorkspaceNewChatTarget", () => {
  it("starts a standalone chat from Fleet, which has no selected chat", () => {
    expect(
      resolveWorkspaceNewChatTarget({
        fleetActive: true,
        projects: [],
        selectedChatId: undefined,
        selectedProjectId: undefined,
        workspaceMode: "chat",
      }),
    ).toEqual({ type: "standalone" });
  });

  it("starts a project chat from Fleet in a project mode", () => {
    expect(
      resolveWorkspaceNewChatTarget({
        fleetActive: true,
        projects: [PROJECT],
        selectedChatId: undefined,
        selectedProjectId: PROJECT.id,
        workspaceMode: "work",
      }),
    ).toEqual({ project: PROJECT, type: "project" });
  });

  it("falls back to the first project when none is selected", () => {
    expect(
      resolveWorkspaceNewChatTarget({
        fleetActive: true,
        projects: [PROJECT],
        selectedChatId: undefined,
        selectedProjectId: "missing",
        workspaceMode: "power",
      }),
    ).toEqual({ project: PROJECT, type: "project" });
  });

  it("stays a no-op on a draft route, which already shows the composer", () => {
    expect(
      resolveWorkspaceNewChatTarget({
        fleetActive: false,
        projects: [PROJECT],
        selectedChatId: undefined,
        selectedProjectId: PROJECT.id,
        workspaceMode: "work",
      }),
    ).toEqual({ type: "none" });
  });

  it("starts a chat from an open chat route", () => {
    expect(
      resolveWorkspaceNewChatTarget({
        fleetActive: false,
        projects: [],
        selectedChatId: "chat-1",
        selectedProjectId: undefined,
        workspaceMode: "chat",
      }),
    ).toEqual({ type: "standalone" });
  });
});
