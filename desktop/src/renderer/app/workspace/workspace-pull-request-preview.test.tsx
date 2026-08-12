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

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => ({
    capabilities: {
      entries: { "changeRequests.get": { supported: true } },
    },
    projectPath: "/repos/widgets",
    providerIdentity: "github:github.com/acme/widgets:1",
    status: "active",
  }),
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
    const onOpenExternal = vi.fn();
    const openBrowserTab = vi.fn();
    const onOpenChange = vi.fn();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPreview({ onOpenExternal, onOpenChange, viewPullRequest });

    expect(screen.getByRole("status")).toBeDefined();
    request.resolve(detail);

    expect(await screen.findByText("Preview pull requests")).toBeDefined();
    expect(screen.getByText("common.draft")).toBeDefined();
    expect(
      screen.getByText("workspace.tools.createPullRequest.preview.emptyBody"),
    ).toBeDefined();
    expect(screen.getByText("main ← feature/preview")).toBeDefined();
    expect(viewPullRequest).toHaveBeenCalledWith("/repos/widgets", "42");

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
        name: "workspace.tools.createPullRequest.openInBrowser",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenExternal).toHaveBeenCalledWith(detail.url);
    expect(openBrowserTab).not.toHaveBeenCalled();
  }, 10_000);

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
  onOpenExternal = vi.fn(),
  onOpenChange = vi.fn(),
  viewPullRequest,
}: {
  onOpenExternal?: (url: string) => void;
  onOpenChange?: (open: boolean) => void;
  viewPullRequest: (
    projectPath: string,
    id: string,
  ) => Promise<GitHubPullRequestDetail>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const api = {
    sourceControl: {
      getChangeRequest: async (projectPath: string, id: string) =>
        toChangeRequest(await viewPullRequest(projectPath, id)),
    },
  } as unknown as ApiClient;

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePullRequestPreviewDialog
        api={api}
        open
        projectId="project-1"
        target={{ number: 42, url: detail.url }}
        onOpenExternal={onOpenExternal}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}

function toChangeRequest(detail: GitHubPullRequestDetail) {
  const repository = {
    displayPath: `${detail.owner}/${detail.repo}`,
    host: "github.com",
    name: detail.repo,
    namespace: [detail.owner],
    providerId: "github",
    remoteId: null,
    webUrl: `https://github.com/${detail.owner}/${detail.repo}`,
  };
  return {
    additions: detail.additions,
    allowedMergeMethods: [],
    author: detail.author
      ? {
          avatarUrl: null,
          displayName: null,
          id: null,
          login: detail.author,
          webUrl: null,
        }
      : null,
    body: detail.body,
    changedFiles: detail.changedFiles,
    commitCount: detail.commitCount,
    createdAt: null,
    defaultMergeMethod: null,
    deletions: detail.deletions,
    draft: detail.isDraft,
    id: String(detail.number),
    mergeRequirements: [],
    mergedAt: null,
    number: detail.number,
    repository,
    reviewDecision: "none",
    source: { name: detail.headRefName, oid: null, repository },
    state: detail.state.toLocaleLowerCase(),
    target: { name: detail.baseRefName, oid: null, repository },
    title: detail.title,
    updatedAt: detail.updatedAt,
    viewerCanMerge: null,
    webUrl: detail.url,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
