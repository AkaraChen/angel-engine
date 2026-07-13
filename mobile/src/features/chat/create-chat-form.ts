import type {
  ChatCreateInput,
  ChatCreationLocation,
} from "@angel-engine/daemon-api/chat";

export interface CreateChatFormState {
  projectId: string;
  /**
   * The first message. `POST /api/chats` creates an empty chat, so this is
   * handed to the Chat page to prefill/send once the new chat opens (see
   * `stashNewChatPrompt`). Optional — an empty chat is allowed.
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
  runtime: "",
  model: "",
  reasoningEffort: "",
  useWorktree: false,
};

/** A worktree can only be requested against a project. */
export function canUseWorktree(form: CreateChatFormState): boolean {
  return form.projectId.length > 0;
}

/**
 * Keeps the selected runtime pointing at an agent the daemon actually offers:
 * the current value if still valid, otherwise the first available id, or `""`
 * when nothing is available (which blocks submission). Treating the daemon list
 * as authoritative avoids submitting a runtime it never returned.
 */
export function reconcileRuntime(
  currentRuntime: string,
  availableRuntimeIds: readonly string[],
): string {
  if (currentRuntime.length > 0 && availableRuntimeIds.includes(currentRuntime))
    return currentRuntime;
  return availableRuntimeIds[0] ?? "";
}

/**
 * Submittable once a valid runtime is chosen. The runtime must come from the
 * daemon's agent list (the caller passes the available ids), so an empty or
 * unavailable list blocks creation rather than silently sending a default.
 */
export function canSubmitCreateChat(
  form: CreateChatFormState,
  availableRuntimeIds: readonly string[],
): boolean {
  return form.runtime.length > 0 && availableRuntimeIds.includes(form.runtime);
}

/**
 * Projects the form state into the `POST /api/chats` payload, stripping empty
 * optionals. `creationLocation` is only sent when a project is selected (the
 * daemon needs a project to place a worktree), and the prompt is not part of
 * the payload — the daemon creates an empty chat.
 */
export function buildCreateChatInput(
  form: CreateChatFormState,
): ChatCreateInput {
  const hasProject = canUseWorktree(form);
  const model = form.model.trim();
  const creationLocation: ChatCreationLocation | undefined = hasProject
    ? form.useWorktree
      ? "worktree"
      : "project"
    : undefined;

  return {
    projectId: hasProject ? form.projectId : undefined,
    runtime: form.runtime,
    model: model.length > 0 ? model : undefined,
    reasoningEffort:
      form.reasoningEffort.length > 0 ? form.reasoningEffort : undefined,
    creationLocation,
  };
}
