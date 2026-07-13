import type { CreateChatInput } from "@/platform/chat-types";

import { DEFAULT_AGENT_RUNTIME } from "@/platform/agent-catalog";

export interface CreateChatFormState {
  projectId: string;
  /**
   * The first message. `POST /api/chats` creates an empty chat, so this is
   * handed to the Chat page to send once the new chat opens (see
   * `stashNewChatPrompt`).
   */
  prompt: string;
  runtime: string;
  model: string;
  reasoningEffort: string;
  /** Maps to `creationLocation: "worktree"`; only valid with a project. */
  useWorktree: boolean;
}

export const INITIAL_CREATE_CHAT_FORM: CreateChatFormState = {
  projectId: "",
  prompt: "",
  runtime: DEFAULT_AGENT_RUNTIME,
  model: "",
  reasoningEffort: "",
  useWorktree: false,
};

/** A worktree can only be requested against a project. */
export function canUseWorktree(form: CreateChatFormState): boolean {
  return form.projectId.length > 0;
}

export function canSubmitCreateChat(form: CreateChatFormState): boolean {
  return form.prompt.trim().length > 0;
}

/**
 * Projects the form state into the `POST /api/chats` payload, stripping empty
 * optionals. `creationLocation` is only sent when a project is selected (the
 * daemon needs a project to place a worktree), and the prompt is not part of
 * the payload — the daemon creates an empty chat.
 */
export function buildCreateChatInput(
  form: CreateChatFormState,
): CreateChatInput {
  const hasProject = canUseWorktree(form);
  const model = form.model.trim();

  return {
    projectId: hasProject ? form.projectId : undefined,
    runtime: form.runtime,
    model: model.length > 0 ? model : undefined,
    reasoningEffort:
      form.reasoningEffort.length > 0 ? form.reasoningEffort : undefined,
    creationLocation: hasProject
      ? form.useWorktree
        ? "worktree"
        : "project"
      : undefined,
  };
}
