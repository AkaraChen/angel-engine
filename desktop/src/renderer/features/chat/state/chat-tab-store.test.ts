import { beforeEach, describe, expect, it } from "vitest";
import {
  openChatTab,
  setPowerActiveWorktree,
  setPowerDraftWorktree,
  setPowerWorktreeView,
  useChatTabStore,
} from "./chat-tab-store";

const worktree = {
  cwd: "/repo/.angel-engine/worktrees/main/abc12345",
  groupKey: "worktree:abc12345",
  projectId: "project-1",
};

describe("power chat tab store", () => {
  beforeEach(() => {
    useChatTabStore.setState({
      activeWorktree: undefined,
      activeWorktreeView: null,
      draftWorktree: undefined,
      tabGroups: {},
    });
  });

  it("keeps the active Home worktree outside route component state", () => {
    setPowerActiveWorktree(worktree);
    setPowerWorktreeView("home");

    expect(useChatTabStore.getState()).toMatchObject({
      activeWorktree: worktree,
      activeWorktreeView: "home",
    });
  });

  it("closing the last chat tab does not clear the fixed Home tab state", () => {
    setPowerActiveWorktree(worktree);
    setPowerWorktreeView("home");
    openChatTab(worktree.groupKey, "chat-1");

    useChatTabStore.getState().closeChatTab(worktree.groupKey, "chat-1");

    expect(useChatTabStore.getState().tabGroups[worktree.groupKey]).toBe(
      undefined,
    );
    expect(useChatTabStore.getState()).toMatchObject({
      activeWorktree: worktree,
      activeWorktreeView: "home",
    });
  });

  it("clears only draft state when switching from draft back to Home", () => {
    setPowerActiveWorktree(worktree);
    setPowerDraftWorktree(worktree);
    setPowerWorktreeView("draft");

    setPowerDraftWorktree(undefined);
    setPowerWorktreeView("home");

    expect(useChatTabStore.getState()).toMatchObject({
      activeWorktree: worktree,
      activeWorktreeView: "home",
      draftWorktree: undefined,
    });
  });
});
