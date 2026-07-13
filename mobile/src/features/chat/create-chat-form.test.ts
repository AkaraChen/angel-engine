import type { CreateChatFormState } from "./create-chat-form";

import { describe, expect, it } from "vitest";

import {
  buildCreateChatInput,
  canSubmitCreateChat,
  canUseWorktree,
  INITIAL_CREATE_CHAT_FORM,
  reconcileRuntime,
} from "./create-chat-form";

function form(overrides: Partial<CreateChatFormState>): CreateChatFormState {
  return { ...INITIAL_CREATE_CHAT_FORM, ...overrides };
}

const IDS = ["claude", "codex"];

describe("canSubmitCreateChat", () => {
  it("requires a runtime that the daemon actually offers", () => {
    expect(canSubmitCreateChat(form({ runtime: "" }), IDS)).toBe(false);
    expect(canSubmitCreateChat(form({ runtime: "gemini" }), IDS)).toBe(false);
    expect(canSubmitCreateChat(form({ runtime: "claude" }), IDS)).toBe(true);
  });

  it("blocks submit when no agents are available", () => {
    expect(canSubmitCreateChat(form({ runtime: "claude" }), [])).toBe(false);
  });
});

describe("reconcileRuntime", () => {
  it("keeps a still-valid selection", () => {
    expect(reconcileRuntime("codex", ["claude", "codex"])).toBe("codex");
  });

  it("falls back to the first agent when the selection is gone or empty", () => {
    expect(reconcileRuntime("gemini", ["claude", "codex"])).toBe("claude");
    expect(reconcileRuntime("", ["claude", "codex"])).toBe("claude");
  });

  it("returns empty when no agents are available", () => {
    expect(reconcileRuntime("claude", [])).toBe("");
  });
});

describe("canUseWorktree", () => {
  it("is false without a project", () => {
    expect(canUseWorktree(form({ projectId: "" }))).toBe(false);
    expect(canUseWorktree(form({ projectId: "p1" }))).toBe(true);
  });
});

describe("buildCreateChatInput", () => {
  it("strips empty optional fields and omits creationLocation without a project", () => {
    const input = buildCreateChatInput(
      form({ runtime: "claude", model: "  ", reasoningEffort: "" }),
    );
    expect(input).toEqual({
      projectId: undefined,
      runtime: "claude",
      model: undefined,
      reasoningEffort: undefined,
      creationLocation: undefined,
    });
  });

  it("passes model and reasoning through when set", () => {
    const input = buildCreateChatInput(
      form({ runtime: "claude", model: " gpt-x ", reasoningEffort: "high" }),
    );
    expect(input.model).toBe("gpt-x");
    expect(input.reasoningEffort).toBe("high");
  });

  it("sends creationLocation=project for a project chat", () => {
    const input = buildCreateChatInput(
      form({ runtime: "claude", projectId: "p1", useWorktree: false }),
    );
    expect(input.projectId).toBe("p1");
    expect(input.creationLocation).toBe("project");
  });

  it("sends creationLocation=worktree when the worktree toggle is on", () => {
    const input = buildCreateChatInput(
      form({ runtime: "claude", projectId: "p1", useWorktree: true }),
    );
    expect(input.creationLocation).toBe("worktree");
  });

  it("never requests a worktree without a project even if the flag is stale", () => {
    const input = buildCreateChatInput(
      form({ runtime: "claude", projectId: "", useWorktree: true }),
    );
    expect(input.projectId).toBeUndefined();
    expect(input.creationLocation).toBeUndefined();
  });
});
