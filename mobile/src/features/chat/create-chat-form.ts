import type { CreateChatInput } from "@/platform/chat-types";

import { DEFAULT_AGENT_RUNTIME } from "@/platform/agent-catalog";

export interface CreateChatFormState {
  projectId: string;
  prompt: string;
  runtime: string;
  model: string;
  reasoningEffort: string;
}

export const INITIAL_CREATE_CHAT_FORM: CreateChatFormState = {
  projectId: "",
  prompt: "",
  runtime: DEFAULT_AGENT_RUNTIME,
  model: "",
  reasoningEffort: "",
};

export function canSubmitCreateChat(form: CreateChatFormState): boolean {
  return form.prompt.trim().length > 0;
}

export function buildCreateChatInput(
  form: CreateChatFormState,
): CreateChatInput {
  const model = form.model.trim();

  return {
    projectId: form.projectId.length > 0 ? form.projectId : undefined,
    runtime: form.runtime,
    model: model.length > 0 ? model : undefined,
    reasoningEffort:
      form.reasoningEffort.length > 0 ? form.reasoningEffort : undefined,
  };
}
