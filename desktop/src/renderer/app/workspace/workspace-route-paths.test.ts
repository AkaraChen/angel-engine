import type { Chat } from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";
import {
  chatRoutePath,
  chatRoutePathId,
  projectChatRoutePath,
} from "./workspace-route-paths";

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

describe("chat navigation migration", () => {
  it("keeps legacy project chat URLs addressable without mode state", () => {
    const projectChat = chat({ id: "chat-1", projectId: "project-1" });
    expect(chatRoutePath(projectChat)).toBe("/project/project-1/chat-1");
    expect(projectChatRoutePath("project-1", "chat-1")).toBe(
      "/project/project-1/chat-1",
    );
  });

  it("uses the standalone chat URL when a chat has no project", () => {
    expect(chatRoutePath(chat({ id: "chat-2" }))).toBe("/chat/chat-2");
    expect(chatRoutePathId("chat-2")).toBe("/chat/chat-2");
  });
});
