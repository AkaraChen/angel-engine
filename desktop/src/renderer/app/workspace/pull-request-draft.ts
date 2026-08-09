export interface PullRequestEditableFields {
  body: string;
  bodyDirty: boolean;
  title: string;
  titleDirty: boolean;
}

export interface PullRequestDialogState {
  base: string;
  body: string;
  draft: boolean;
  open: boolean;
  root: string;
  title: string;
}

export function resetPullRequestDialogState(
  root: string,
): PullRequestDialogState {
  return { base: "", body: "", draft: false, open: false, root, title: "" };
}

export function applyPullRequestPrefill(
  current: PullRequestEditableFields,
  prefill: { body: string; title: string },
): PullRequestEditableFields {
  return {
    ...current,
    body: current.bodyDirty ? current.body : prefill.body,
    title: current.titleDirty ? current.title : prefill.title,
  };
}
