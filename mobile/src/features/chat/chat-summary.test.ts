import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";

import { describe, expect, it } from "vitest";

import { deriveChatSummaries } from "./chat-summary";

function chat(overrides: Partial<Chat>): Chat {
  return {
    archived: false,
    createdAt: "2026-07-13T10:00:00Z",
    cwd: null,
    id: "chat-1",
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "claude",
    title: "New chat",
    updatedAt: "2026-07-13T10:00:00Z",
    ...overrides,
  };
}

const projects: Project[] = [
  { id: "project-1", path: "/Users/dev/angel-engine" },
];

describe("deriveChatSummaries", () => {
  it("drops archived chats", () => {
    const summaries = deriveChatSummaries(
      [chat({ id: "a", archived: true }), chat({ id: "b" })],
      projects,
    );
    expect(summaries.map((summary) => summary.id)).toEqual(["b"]);
  });

  it("resolves the project name from the chat's project", () => {
    const [summary] = deriveChatSummaries(
      [chat({ projectId: "project-1", cwd: "/Users/dev/angel-engine" })],
      projects,
    );
    expect(summary.projectName).toBe("angel-engine");
    expect(summary.worktreeBranch).toBeNull();
  });

  it("labels a worktree by its last path segment when cwd differs from the project root", () => {
    const [summary] = deriveChatSummaries(
      [
        chat({
          projectId: "project-1",
          cwd: "/Users/dev/angel-engine-worktrees/feature-x",
        }),
      ],
      projects,
    );
    expect(summary.projectName).toBe("angel-engine");
    expect(summary.worktreeBranch).toBe("feature-x");
  });

  it("treats a trailing-slash cwd equal to the project root as the main worktree", () => {
    const [summary] = deriveChatSummaries(
      [chat({ projectId: "project-1", cwd: "/Users/dev/angel-engine/" })],
      projects,
    );
    expect(summary.worktreeBranch).toBeNull();
  });

  it("leaves project and worktree null for an ad hoc chat", () => {
    const [summary] = deriveChatSummaries(
      [chat({ projectId: null })],
      projects,
    );
    expect(summary.projectName).toBeNull();
    expect(summary.worktreeBranch).toBeNull();
  });
});
