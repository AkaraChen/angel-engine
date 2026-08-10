import { useEffect } from "react";

export interface ExistingPullRequestTarget {
  number: number;
  url: string;
}

const createPullRequestEvent = "angel-engine:create-pull-request";

export const createPullRequestAction = {
  id: "workspace.createPullRequest",
  execute() {
    window.dispatchEvent(new Event(createPullRequestEvent));
  },
  shortcut: "CommandOrControl+Shift+P",
} as const;

export function openPullRequestInSystemBrowser(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openExistingPullRequest({
  close,
  openExternal,
  url,
}: {
  close?: () => void;
  openExternal: (url: string) => void;
  url: string;
}) {
  close?.();
  openExternal(url);
}

export function executeCreatePullRequestAction({
  existing,
  openDialog,
  openPreview,
}: {
  existing?: ExistingPullRequestTarget | null;
  openDialog: () => void;
  openPreview: (target: ExistingPullRequestTarget) => void;
}) {
  if (existing) {
    openPreview(existing);
    return "opened-preview" as const;
  }
  openDialog();
  return "opened-create" as const;
}

export function useCreatePullRequestAction(handler: () => void) {
  useEffect(() => {
    window.addEventListener(createPullRequestEvent, handler);
    return () => window.removeEventListener(createPullRequestEvent, handler);
  }, [handler]);
}
