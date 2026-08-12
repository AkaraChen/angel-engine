// @vitest-environment jsdom

import type { ChangeRequest } from "@angel-engine/daemon-api/source-control";
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
    providerIdentity: "forge:code.example/acme/widgets:1",
    status: "active",
  }),
}));

const repository = {
  displayPath: "acme/widgets",
  host: "code.example",
  name: "widgets",
  namespace: ["acme"],
  providerId: "forge",
  remoteId: null,
  webUrl: "https://code.example/acme/widgets",
} as const;

const detail: ChangeRequest = {
  additions: 120,
  allowedMergeMethods: [],
  author: {
    avatarUrl: null,
    displayName: null,
    id: null,
    login: "alice",
    webUrl: null,
  },
  body: "",
  changedFiles: 8,
  commitCount: 2,
  createdAt: null,
  defaultMergeMethod: null,
  deletions: 35,
  draft: true,
  id: "42",
  mergeRequirements: [],
  mergedAt: null,
  number: 42,
  repository,
  reviewDecision: "none",
  source: { name: "feature/preview", oid: null, repository },
  state: "open",
  target: { name: "main", oid: null, repository },
  title: "Preview pull requests",
  updatedAt: "2026-08-10T00:00:00Z",
  viewerCanMerge: null,
  webUrl: "https://code.example/acme/widgets/changes/42",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkspacePullRequestPreviewDialog", () => {
  it("keeps loading visible, then renders draft and empty-body details", async () => {
    const request = deferred<ChangeRequest>();
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
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(detail.webUrl));
    expect(
      screen.getByText("workspace.tools.createPullRequest.preview.copied"),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace.tools.createPullRequest.openInBrowser",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenExternal).toHaveBeenCalledWith(detail.webUrl);
    expect(openBrowserTab).not.toHaveBeenCalled();
  }, 10_000);

  it("retains the dialog on failure and retries the detail query", async () => {
    const viewPullRequest = vi
      .fn<() => Promise<ChangeRequest>>()
      .mockRejectedValueOnce(new Error("Provider unavailable"))
      .mockResolvedValueOnce({ ...detail, body: "## Summary" });

    renderPreview({ viewPullRequest });

    expect(
      await screen.findByText(
        "workspace.tools.createPullRequest.preview.loadFailed",
      ),
    ).toBeDefined();
    expect(screen.getByText("Provider unavailable")).toBeDefined();

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
  viewPullRequest: (projectPath: string, id: string) => Promise<ChangeRequest>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const api = {
    sourceControl: {
      getChangeRequest: viewPullRequest,
    },
  } as unknown as ApiClient;

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePullRequestPreviewDialog
        api={api}
        open
        projectId="project-1"
        target={{ number: 42, url: detail.webUrl }}
        onOpenExternal={onOpenExternal}
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
