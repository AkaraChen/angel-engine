// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewChatRecentSection } from "./new-chat-recent";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function chat(overrides: Partial<Chat> & Pick<Chat, "id" | "updatedAt">): Chat {
  return {
    archived: false,
    createdAt: overrides.updatedAt,
    cwd: null,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: "Untitled",
    ...overrides,
  };
}

const projects: Project[] = [
  {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "project-1",
    path: "/Users/eric/Developer/angel-engine",
  } as Project,
];

afterEach(cleanup);

describe("NewChatRecentSection", () => {
  it("lists the four most recent unarchived chats, newest first", () => {
    render(
      <NewChatRecentSection
        chats={[
          chat({ id: "1", title: "oldest", updatedAt: "2026-01-01T00:00:00Z" }),
          chat({ id: "2", title: "newest", updatedAt: "2026-01-06T00:00:00Z" }),
          chat({ id: "3", title: "second", updatedAt: "2026-01-05T00:00:00Z" }),
          chat({ id: "4", title: "third", updatedAt: "2026-01-04T00:00:00Z" }),
          chat({ id: "5", title: "fourth", updatedAt: "2026-01-03T00:00:00Z" }),
          chat({
            archived: true,
            id: "6",
            title: "archived",
            updatedAt: "2026-01-07T00:00:00Z",
          }),
        ]}
        onCreateProject={vi.fn()}
        onOpenChat={vi.fn()}
        projects={projects}
      />,
    );

    const titles = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(titles).toHaveLength(4);
    expect(titles[0]).toContain("newest");
    expect(titles[3]).toContain("fourth");
    expect(titles.join(" ")).not.toContain("archived");
    expect(titles.join(" ")).not.toContain("oldest");
  });

  it("falls back to the project path when the chat has no cwd", () => {
    render(
      <NewChatRecentSection
        chats={[
          chat({
            id: "1",
            projectId: "project-1",
            title: "planning",
            updatedAt: "2026-01-01T00:00:00Z",
          }),
        ]}
        onCreateProject={vi.fn()}
        onOpenChat={vi.fn()}
        projects={projects}
      />,
    );

    expect(screen.getByText("angel-engine")).toBeTruthy();
  });

  it("offers the project action when there is nothing to resume", () => {
    const onCreateProject = vi.fn();
    render(
      <NewChatRecentSection
        chats={[]}
        onCreateProject={onCreateProject}
        onOpenChat={vi.fn()}
        projects={projects}
      />,
    );

    expect(screen.getByText("thread.empty.recentEmpty")).toBeTruthy();
    screen.getByRole("button").click();
    expect(onCreateProject).toHaveBeenCalledOnce();
  });
});
