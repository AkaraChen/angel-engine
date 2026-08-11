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

const pullRequestStatus = vi.fn();
const openBrowserTab = vi.fn();

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

vi.mock("@/app/workspace/workspace-tool-surface-model", () => ({
  useWorkspaceToolSurface: () => ({
    active: true,
    api: {
      github: {
        pullRequestStatus,
      },
    },
    chatId: "chat-1",
    openBrowserTab,
  }),
}));

// CollapsibleText measures scrollHeight; drive overflow so the thread toggle appears.
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
import { defaultCollapsedTextMaxHeight } from "@/components/ui/collapsible-text";

const longThreadBody = Array.from(
  { length: 40 },
  (_, index) =>
    `Review note line ${index + 1}: please keep the checks section consistent.`,
).join("\n");

const openStatus: GitHubPullRequestStatus = {
  allowedMergeMethods: ["squash", "merge", "rebase"],
  author: "alice",
  baseRefName: "main",
  behindBy: 0,
  body: "Short PR body",
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
      path: "desktop/src/renderer/app/workspace/workspace-checks-panel.tsx",
      url: "https://github.com/acme/widgets/pull/42#discussion_r1",
    },
  ],
  url: "https://github.com/acme/widgets/pull/42",
  viewerCanMerge: true,
  worktreeDirty: false,
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PullRequestPanel root="/repo" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  scrollHeight = defaultCollapsedTextMaxHeight + 80;
  pullRequestStatus.mockReset();
  openBrowserTab.mockReset();
  pullRequestStatus.mockResolvedValue(openStatus);
  window.localStorage.clear();
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

describe("PullRequestPanel review threads", () => {
  it("renders unresolved review thread bodies through CollapsibleText", async () => {
    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByText(
          "desktop/src/renderer/app/workspace/workspace-checks-panel.tsx:12 · @bob",
        ),
      ).toBeDefined();
    });

    // Actual panel path: thread body text is mounted, not only a component unit test.
    expect(screen.getByText(/Review note line 1:/)).toBeDefined();
    expect(screen.getByText(/Review note line 40:/)).toBeDefined();

    const toggles = screen.getAllByTestId("collapsible-text-toggle");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    expect(
      toggles.some((toggle) =>
        (toggle.textContent ?? "").includes("common.loadMore"),
      ),
    ).toBe(true);

    // Regression: status fetch is the real panel query path.
    expect(pullRequestStatus).toHaveBeenCalledWith({ cwd: "/repo" });
  });
});
