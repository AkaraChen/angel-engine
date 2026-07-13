import type { Chat } from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";
import { lastOpenedTargetPath } from "./workspace-route-paths";

function chat(input: Partial<Chat> & Pick<Chat, "id">): Chat {
  return {
    archived: false,
    createdAt: "2026-07-04T00:00:00.000Z",
    cwd: null,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: input.id,
    updatedAt: "2026-07-04T00:00:00.000Z",
    ...input,
  };
}

describe("lastOpenedTargetPath", () => {
  it("opens chat and draft targets for the matching mode", () => {
    const standaloneChat = chat({ id: "standalone" });
    const projectChat = chat({ id: "project", projectId: "project-id" });
    const chats = [standaloneChat, projectChat];

    expect(
      lastOpenedTargetPath({
        chats,
        target: { chatId: standaloneChat.id, type: "chat" },
        workspaceMode: "chat",
      }),
    ).toBe("/chat/standalone");
    expect(
      lastOpenedTargetPath({
        chats,
        target: { chatId: projectChat.id, type: "chat" },
        workspaceMode: "work",
      }),
    ).toBe("/project/project-id/project");
    expect(
      lastOpenedTargetPath({
        chats,
        target: { type: "draft" },
        workspaceMode: "chat",
      }),
    ).toBe("/");
    expect(
      lastOpenedTargetPath({
        chats,
        target: { projectId: "project-id", type: "draft" },
        workspaceMode: "work",
      }),
    ).toBe("/project/project-id");
  });

  it("guards archived, missing, and wrong-mode chat targets", () => {
    const standaloneChat = chat({ id: "standalone" });
    const projectChat = chat({ id: "project", projectId: "project-id" });
    const archivedChat = chat({ archived: true, id: "archived" });
    const chats = [standaloneChat, projectChat, archivedChat];

    expect(
      lastOpenedTargetPath({
        chats,
        target: { chatId: projectChat.id, type: "chat" },
        workspaceMode: "chat",
      }),
    ).toBe(undefined);
    expect(
      lastOpenedTargetPath({
        chats,
        target: { chatId: archivedChat.id, type: "chat" },
        workspaceMode: "work",
      }),
    ).toBe(undefined);
    expect(
      lastOpenedTargetPath({
        chats,
        target: { chatId: "missing", type: "chat" },
        workspaceMode: "chat",
      }),
    ).toBe(undefined);
  });
});
