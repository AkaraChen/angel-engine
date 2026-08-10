// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorktreeCreationActions } from "./worktree-creation-actions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("WorktreeCreationActions", () => {
  it("opens the chat that owns a conflicting pull request branch", () => {
    const owner = chat({ id: "owner" });
    const blocked = chat({
      id: "blocked",
      worktreeCreation: {
        errorCode: "worktree-branch-in-use",
        jobId: "job-1",
        progress: 45,
        relatedChatId: owner.id,
        stage: "worktree",
        status: "failed",
      },
    });
    const onOpenChat = vi.fn();
    const onRetry = vi.fn();

    render(
      <WorktreeCreationActions
        chat={blocked}
        onCancel={vi.fn()}
        onOpenChat={onOpenChat}
        onRetry={onRetry}
        projectChats={[blocked, owner]}
      />,
    );
    fireEvent.click(screen.getByLabelText("sidebar.openBranchChat"));

    expect(onOpenChat).toHaveBeenCalledWith(owner);
    expect(onRetry).not.toHaveBeenCalled();
  });
});

function chat(overrides: Partial<Chat>): Chat {
  return {
    archived: false,
    createdAt: "2026-08-09T00:00:00.000Z",
    cwd: "/repo",
    id: "chat",
    pinned: false,
    projectId: "project-1",
    remoteThreadId: null,
    runtime: "codex",
    title: "Chat",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}
