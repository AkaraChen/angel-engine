import type { CreateChatFormState } from "./create-chat-form";

import { describe, expect, it } from "vitest";

import {
  buildCreateChatInput,
  canSubmitCreateChat,
  canUseWorktree,
  INITIAL_CREATE_CHAT_FORM,
  isWorktreeSelectionComplete,
} from "./create-chat-form";

function form(overrides: Partial<CreateChatFormState>): CreateChatFormState {
  return { ...INITIAL_CREATE_CHAT_FORM, ...overrides };
}

describe("canSubmitCreateChat", () => {
  it("requires a non-empty prompt", () => {
    expect(canSubmitCreateChat(form({ prompt: "   " }))).toBe(false);
    expect(canSubmitCreateChat(form({ prompt: "do the thing" }))).toBe(true);
  });

  it("blocks submit when a worktree is requested without a branch", () => {
    const state = form({
      prompt: "go",
      projectId: "p1",
      useWorktree: true,
      worktreeBranch: "",
    });
    expect(isWorktreeSelectionComplete(state)).toBe(false);
    expect(canSubmitCreateChat(state)).toBe(false);
  });

  it("allows submit once a branch is chosen for the worktree", () => {
    const state = form({
      prompt: "go",
      projectId: "p1",
      useWorktree: true,
      worktreeBranch: "feature/x",
    });
    expect(canSubmitCreateChat(state)).toBe(true);
  });
});

describe("canUseWorktree", () => {
  it("is false without a project", () => {
    expect(canUseWorktree(form({ projectId: "" }))).toBe(false);
    expect(canUseWorktree(form({ projectId: "p1" }))).toBe(true);
  });
});

describe("buildCreateChatInput", () => {
  it("strips empty optional fields", () => {
    const input = buildCreateChatInput(
      form({ prompt: "  hi  ", model: "  ", reasoningEffort: "" }),
    );
    expect(input).toMatchObject({
      prompt: "hi",
      runtime: "claude",
      projectId: undefined,
      model: undefined,
      reasoningEffort: undefined,
      useWorktree: false,
      worktreeBranch: undefined,
      createWorktree: undefined,
    });
  });

  it("passes model and reasoning through when set", () => {
    const input = buildCreateChatInput(
      form({ prompt: "hi", model: " gpt-x ", reasoningEffort: "high" }),
    );
    expect(input.model).toBe("gpt-x");
    expect(input.reasoningEffort).toBe("high");
  });

  it("never emits a worktree without a project even if the flag is stale", () => {
    const input = buildCreateChatInput(
      form({
        prompt: "hi",
        projectId: "",
        useWorktree: true,
        worktreeBranch: "feature/x",
      }),
    );
    expect(input.useWorktree).toBe(false);
    expect(input.worktreeBranch).toBeUndefined();
    expect(input.createWorktree).toBeUndefined();
  });

  it("marks createWorktree for a new branch and trims it", () => {
    const input = buildCreateChatInput(
      form({
        prompt: "hi",
        projectId: "p1",
        useWorktree: true,
        worktreeMode: "create",
        worktreeBranch: "  feature/new  ",
      }),
    );
    expect(input.projectId).toBe("p1");
    expect(input.useWorktree).toBe(true);
    expect(input.worktreeBranch).toBe("feature/new");
    expect(input.createWorktree).toBe(true);
  });

  it("uses an existing branch without the create flag", () => {
    const input = buildCreateChatInput(
      form({
        prompt: "hi",
        projectId: "p1",
        useWorktree: true,
        worktreeMode: "existing",
        worktreeBranch: "main",
      }),
    );
    expect(input.worktreeBranch).toBe("main");
    expect(input.createWorktree).toBe(false);
  });
});
