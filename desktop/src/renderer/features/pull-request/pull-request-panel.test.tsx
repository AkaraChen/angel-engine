// @vitest-environment jsdom

import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { defaultCollapsedTextMaxHeight } from "@/components/ui/collapsible-text";

const pullRequestStatus = vi.fn();
const currentChangeRequest = vi.fn(async () =>
  toChangeRequestStatus(await pullRequestStatus()),
);
const openBrowserTab = vi.fn();
const updateSnapshot = vi.fn();
let focusChecksSection = false;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => vi.fn(),
}));

vi.mock("@/app/workspace/workspace-checks-panel", () => ({
  WorkspaceChecksSection: () => (
    <div data-testid="workspace-checks-section">checks-section</div>
  ),
}));

vi.mock("@/features/shepherd/shepherd-section", () => ({
  ShepherdSection: () => <div data-testid="shepherd-section">shepherd</div>,
}));

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => ({
    capabilities: {
      entries: {
        "changeRequests.list": { supported: true },
        "changeRequests.status": { supported: true },
      },
    },
    projectPath: "/repo",
    providerIdentity: "github:github.com/acme/widgets:1",
    status: "active",
  }),
}));

vi.mock("@/app/workspace/workspace-tool-surface-model", () => ({
  useWorkspaceToolSurface: () => ({
    active: true,
    api: {
      github: {
        pullRequestStatus,
      },
      sourceControl: { currentChangeRequest },
    },
    chatId: "chat-1",
    focusChecksSection,
    openBrowserTab,
    updateSnapshot,
  }),
}));

let scrollHeight = 0;
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
  configurable: true,
  get: () => scrollHeight,
});

class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
const originalResizeObserver = window.ResizeObserver;
window.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;

import { PullRequestPanel } from "./pull-request-panel";

const longThreadBody = Array.from(
  { length: 30 },
  (_, index) => `Review note line ${index + 1}`,
).join("\n");

const openStatus: GitHubPullRequestStatus = {
  allowedMergeMethods: ["squash", "merge", "rebase"],
  author: "alice",
  baseRefName: "main",
  behindBy: 0,
  body: "PR description body",
  checks: [
    {
      name: "typecheck",
      required: true,
      state: "success",
      url: null,
    },
  ],
  defaultMergeMethod: "squash",
  deleteBranchOnMerge: false,
  headRefName: "feature",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  mergedAt: null,
  number: 42,
  reviewDecision: "APPROVED",
  state: "OPEN",
  title: "Feature",
  unresolvedThreads: [
    {
      author: "bob",
      body: longThreadBody,
      id: "thread-1",
      isOutdated: false,
      line: 12,
      path: "src/example.ts",
      url: "https://github.com/acme/widgets/pull/42#discussion_r1",
    },
  ],
  url: "https://github.com/acme/widgets/pull/42",
  viewerCanMerge: true,
  worktreeDirty: false,
};

function toChangeRequestStatus(status: GitHubPullRequestStatus) {
  const repository = {
    displayPath: "acme/widgets",
    host: "github.com",
    name: "widgets",
    namespace: ["acme"],
    providerId: "github",
    remoteId: null,
    webUrl: "https://github.com/acme/widgets",
  };
  return {
    changeRequest: {
      additions: 1,
      allowedMergeMethods: status.allowedMergeMethods,
      author: status.author
        ? {
            avatarUrl: null,
            displayName: null,
            id: null,
            login: status.author,
            webUrl: null,
          }
        : null,
      body: status.body,
      changedFiles: 1,
      commitCount: 1,
      createdAt: null,
      defaultMergeMethod: status.defaultMergeMethod,
      deletions: 1,
      draft: status.isDraft,
      extensions: {
        github: {
          mergeable: status.mergeable,
          mergeStateStatus: status.mergeStateStatus,
        },
      },
      id: String(status.number),
      mergeRequirements: [],
      mergedAt: status.mergedAt,
      number: status.number,
      repository,
      reviewDecision:
        status.reviewDecision?.toLocaleLowerCase().replace("_", "-") ?? "none",
      source: { name: status.headRefName, oid: null, repository },
      state: status.state.toLocaleLowerCase(),
      target: { name: status.baseRefName, oid: null, repository },
      title: status.title,
      updatedAt: null,
      viewerCanMerge: status.viewerCanMerge,
      webUrl: status.url,
    },
    checks: null,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PullRequestPanel projectId="project-1" root="/repo" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  scrollHeight = defaultCollapsedTextMaxHeight + 80;
  focusChecksSection = false;
  pullRequestStatus.mockReset();
  currentChangeRequest.mockClear();
  openBrowserTab.mockReset();
  updateSnapshot.mockReset();
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  window.ResizeObserver = originalResizeObserver;
  if (originalScrollHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollHeight",
      originalScrollHeight,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  }
});

describe("PullRequestPanel", () => {
  it("keeps checks focus parked while PR status is loading", async () => {
    focusChecksSection = true;
    let resolveStatus: (value: GitHubPullRequestStatus) => void = () => {};
    pullRequestStatus.mockImplementation(
      () =>
        new Promise<GitHubPullRequestStatus>((resolve) => {
          resolveStatus = resolve;
        }),
    );

    renderPanel();
    expect(
      await screen.findByText("workspace.tools.pullRequest.checking"),
    ).toBeDefined();
    // Focus intent must not be consumed before the Checks section mounts.
    expect(updateSnapshot).not.toHaveBeenCalled();

    resolveStatus(openStatus);
    await waitFor(() => {
      expect(
        screen.queryByText("workspace.tools.pullRequest.checking"),
      ).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByTestId("workspace-checks-section")).toBeDefined();
    });
    await waitFor(() => {
      expect(updateSnapshot).toHaveBeenCalled();
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("renders change-request data fetched with the activation project path", async () => {
    pullRequestStatus.mockResolvedValue(openStatus);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("PR description body")).toBeDefined();
    });
    expect(currentChangeRequest).toHaveBeenCalledWith("/repo");
  });

  it("places Checks before Shepherd", async () => {
    pullRequestStatus.mockResolvedValue(openStatus);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("workspace-checks-section")).toBeDefined();
    });

    const checks = screen.getByTestId("workspace-checks-section");
    const shepherd = screen.getByTestId("shepherd-section");
    expect(
      checks.compareDocumentPosition(shepherd) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
