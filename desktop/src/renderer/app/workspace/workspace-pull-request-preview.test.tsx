// @vitest-environment jsdom

import type { GitHubPullRequestDetail } from "@angel-engine/daemon-api/github";
import type { ReactNode } from "react";
import type { ApiClient } from "@/platform/api-client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspacePullRequestPreviewDialog } from "./workspace-pull-request-preview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("@/app/workspace/workspace-tool-layout", () => ({
  WorkspaceToolBanner: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const detail: GitHubPullRequestDetail = {
  additions: 120,
  author: "alice",
  baseRefName: "main",
  body: "",
  changedFiles: 8,
  comments: [],
  commitCount: 2,
  deletions: 35,
  headRefName: "feature/preview",
  isDraft: true,
  number: 42,
  owner: "acme",
  repo: "widgets",
  state: "OPEN",
  title: "Preview pull requests",
  updatedAt: "2026-08-10T00:00:00Z",
  url: "https://github.com/acme/widgets/pull/42",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkspacePullRequestPreviewDialog", () => {
  it("keeps loading visible, then renders draft and empty-body details", async () => {
    const request = deferred<GitHubPullRequestDetail>();
    const viewPullRequest = vi.fn(() => request.promise);
    const onOpenBrowser = vi.fn();
    const onOpenChange = vi.fn();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPreview({ onOpenBrowser, onOpenChange, viewPullRequest });

    expect(screen.getByRole("status")).toBeDefined();
    request.resolve(detail);

    expect(await screen.findByText("Preview pull requests")).toBeDefined();
    expect(screen.getByText("common.draft")).toBeDefined();
    expect(
      screen.getByText("workspace.tools.createPullRequest.preview.emptyBody"),
    ).toBeDefined();
    expect(screen.getByText("main ← feature/preview")).toBeDefined();
    expect(viewPullRequest).toHaveBeenCalledWith({
      cwd: "/repos/widgets",
      number: 42,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace.tools.createPullRequest.preview.copyLink",
      }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(detail.url));
    expect(
      screen.getByText("workspace.tools.createPullRequest.preview.copied"),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace.tools.createPullRequest.openInApp",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenBrowser).toHaveBeenCalledWith(detail.url);
  });

  it("retains the dialog on failure and retries the detail query", async () => {
    const viewPullRequest = vi
      .fn<() => Promise<GitHubPullRequestDetail>>()
      .mockRejectedValueOnce(new Error("GitHub unavailable"))
      .mockResolvedValueOnce({ ...detail, body: "## Summary" });

    renderPreview({ viewPullRequest });

    expect(
      await screen.findByText(
        "workspace.tools.createPullRequest.preview.loadFailed",
      ),
    ).toBeDefined();
    expect(screen.getByText("GitHub unavailable")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace.tools.createPullRequest.retry",
      }),
    );

    expect(await screen.findByText("## Summary")).toBeDefined();
    expect(viewPullRequest).toHaveBeenCalledTimes(2);
  });
});

function renderPreview({
  onOpenBrowser = vi.fn(),
  onOpenChange = vi.fn(),
  viewPullRequest,
}: {
  onOpenBrowser?: (url: string) => void;
  onOpenChange?: (open: boolean) => void;
  viewPullRequest: () => Promise<GitHubPullRequestDetail>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const api = {
    github: { viewPullRequest },
  } as unknown as ApiClient;

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePullRequestPreviewDialog
        api={api}
        open
        root="/repos/widgets"
        target={{ number: 42, url: detail.url }}
        onOpenBrowser={onOpenBrowser}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
