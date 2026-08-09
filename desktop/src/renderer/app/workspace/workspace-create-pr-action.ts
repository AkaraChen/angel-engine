import { useEffect } from "react";

const createPullRequestEvent = "angel-engine:create-pull-request";

export const createPullRequestAction = {
  id: "workspace.createPullRequest",
  execute() {
    window.dispatchEvent(new Event(createPullRequestEvent));
  },
  shortcut: "CommandOrControl+Shift+P",
} as const;

export function openExistingPullRequest({
  close,
  openBrowser,
  url,
}: {
  close?: () => void;
  openBrowser: (url: string) => void;
  url: string;
}) {
  close?.();
  openBrowser(url);
}

export function useCreatePullRequestAction(handler: () => void) {
  useEffect(() => {
    window.addEventListener(createPullRequestEvent, handler);
    return () => window.removeEventListener(createPullRequestEvent, handler);
  }, [handler]);
}
