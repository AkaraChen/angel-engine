import type { CreateChatFormState } from "./create-chat-form";

import { describe, expect, it } from "vitest";

import {
  buildCreateChatInput,
  canSubmitCreateChat,
  INITIAL_CREATE_CHAT_FORM,
} from "./create-chat-form";

function form(overrides: Partial<CreateChatFormState>): CreateChatFormState {
  return { ...INITIAL_CREATE_CHAT_FORM, ...overrides };
}

describe("canSubmitCreateChat", () => {
  it("requires a non-empty prompt", () => {
    expect(canSubmitCreateChat(form({ prompt: "   " }))).toBe(false);
    expect(canSubmitCreateChat(form({ prompt: "do the thing" }))).toBe(true);
  });
});

describe("buildCreateChatInput", () => {
  it("passes model and reasoning through when set", () => {
    const input = buildCreateChatInput(
      form({ prompt: "hi", model: " gpt-x ", reasoningEffort: "high" }),
    );
    expect(input.model).toBe("gpt-x");
    expect(input.reasoningEffort).toBe("high");
  });
});
