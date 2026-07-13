import type { CreateChatInput } from "@/platform/chat-types";

import { DEFAULT_AGENT_RUNTIME } from "@/platform/agent-catalog";

export type WorktreeMode = "existing" | "create";

export interface CreateChatFormState {
  projectId: string;
  prompt: string;
  runtime: string;
  model: string;
  reasoningEffort: string;
  useWorktree: boolean;
  worktreeMode: WorktreeMode;
  worktreeBranch: string;
}

export const INITIAL_CREATE_CHAT_FORM: CreateChatFormState = {
  projectId: "",
  prompt: "",
  runtime: DEFAULT_AGENT_RUNTIME,
  model: "",
  reasoningEffort: "",
  useWorktree: false,
  worktreeMode: "existing",
  worktreeBranch: "",
};

/** A worktree can only be requested against a project. */
export function canUseWorktree(form: CreateChatFormState): boolean {
  return form.projectId.length > 0;
}

/**
 * Whether the worktree part of the form is coherent: either the user isn't
 * requesting a worktree, or they've picked/named a branch for it. Guards the
 * "worktree on, no branch" contradiction the review flagged.
 */
export function isWorktreeSelectionComplete(
  form: CreateChatFormState,
): boolean {
  if (!form.useWorktree || !canUseWorktree(form)) return true;
  return form.worktreeBranch.trim().length > 0;
}

export function canSubmitCreateChat(form: CreateChatFormState): boolean {
  return form.prompt.trim().length > 0 && isWorktreeSelectionComplete(form);
}

/**
 * Projects the form state into the daemon payload, stripping UI-only sentinels
 * and dropping worktree fields unless a worktree is actually requested against
 * a project (so `useWorktree` can never be true without a project/branch).
 */
export function buildCreateChatInput(
  form: CreateChatFormState,
): CreateChatInput {
  const hasProject = canUseWorktree(form);
  const useWorktree = hasProject && form.useWorktree;
  const branch = form.worktreeBranch.trim();
  const model = form.model.trim();

  return {
    prompt: form.prompt.trim(),
    runtime: form.runtime,
    projectId: hasProject ? form.projectId : undefined,
    model: model.length > 0 ? model : undefined,
    reasoningEffort:
      form.reasoningEffort.length > 0 ? form.reasoningEffort : undefined,
    useWorktree,
    worktreeBranch: useWorktree && branch.length > 0 ? branch : undefined,
    createWorktree: useWorktree ? form.worktreeMode === "create" : undefined,
  };
}
