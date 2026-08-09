export interface PullRequestEditableFields {
  body: string;
  bodyDirty: boolean;
  title: string;
  titleDirty: boolean;
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
