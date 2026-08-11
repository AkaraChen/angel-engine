import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";
import type { FC, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRoute } from "wouter";

import {
  type WorkspaceToolSurfaceModel,
  WorkspaceToolSurfaceProvider,
} from "@/app/workspace/workspace-tool-surface-model";
import { PullRequestPanel } from "@/features/pull-request/pull-request-panel";
import { queryKeys } from "@/platform/query-keys";

const ROOT = "/tmp/angel-engine-kit859-fixture";

const longBody = [
  "Closes KIT-859",
  "",
  "## Summary",
  "",
  "- merge the Pull Request and Checks sidebar tabs into one continuous panel",
  '- redirect legacy `activeTabId: "checks"` snapshots to the Pull Request panel',
  "- embed the existing checks workflow with green-summary collapsing",
  "- render pull request descriptions and collapse long descriptions or review comments",
  "",
  "## Panel behavior",
  "",
  "The panel now has one scrolling surface.",
  "Pull request identity and branch metadata appear first.",
  "The description follows and remains compact when it is long.",
  "Merge readiness, blockers, method selection, and the merge action stay together.",
  "Shepherd controls remain available before CI details.",
  "Checks are a first-class section in the same panel.",
  "All-green checks collapse to one summary row by default.",
  "Pending or failed checks remain expanded.",
  "",
  "## More lines for overflow",
  ...Array.from({ length: 20 }, (_, i) => `Fixture overflow line ${i + 1}.`),
].join("\n");

const longThreadBody = Array.from(
  { length: 24 },
  (_, i) =>
    `Review thread line ${i + 1}: keep Checks styling aligned with ShepherdSection.`,
).join("\n");

function fixtureStatus(mode: "green" | "full"): GitHubPullRequestStatus {
  return {
    allowedMergeMethods: ["squash", "merge", "rebase"],
    author: "akara",
    baseRefName: "master",
    behindBy: 0,
    body: longBody,
    checks:
      mode === "green"
        ? [
            {
              name: "typecheck",
              required: true,
              state: "success",
              url: null,
            },
            {
              name: "lint",
              required: true,
              state: "success",
              url: null,
            },
            {
              name: "test",
              required: true,
              state: "success",
              url: null,
            },
            {
              name: "build",
              required: false,
              state: "success",
              url: null,
            },
          ]
        : [
            {
              name: "typecheck",
              required: true,
              state: "success",
              url: null,
            },
            {
              name: "e2e",
              required: true,
              state: "pending",
              url: null,
            },
          ],
    defaultMergeMethod: "squash",
    deleteBranchOnMerge: false,
    headRefName: "agent/the-flash/11cf0a43",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    mergedAt: null,
    number: 278,
    reviewDecision: "APPROVED",
    state: "OPEN",
    title: "KIT-859: merge Checks into Pull Request panel + collapsible body",
    unresolvedThreads:
      mode === "full"
        ? [
            {
              author: "reviewer",
              body: longThreadBody,
              id: "thread-fixture-1",
              isOutdated: false,
              line: 120,
              path: "desktop/src/renderer/app/workspace/workspace-checks-panel.tsx",
              url: "https://github.com/AkaraChen/angel-engine/pull/278#discussion_r1",
            },
          ]
        : [],
    url: "https://github.com/AkaraChen/angel-engine/pull/278",
    viewerCanMerge: true,
    worktreeDirty: false,
  };
}

/**
 * Dev-only fixture surface for Electron screenshots of the merged PR panel.
 * Loaded at `#/dev/pr-panel-fixture` and `#/dev/pr-panel-fixture/green`.
 */
export const DevPrPanelFixturePage: FC = () => {
  const [, params] = useRoute("/dev/pr-panel-fixture/:mode?");
  const mode =
    params?.mode === "green" ? ("green" as const) : ("full" as const);

  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const status = fixtureStatus(mode);
    client.setQueryData(queryKeys.github.pullRequest(ROOT), status);
    client.setQueryData(queryKeys.github.prChecks(ROOT), {
      checks: status.checks.map((check) => ({
        bucket:
          check.state === "success"
            ? "pass"
            : check.state === "pending"
              ? "pending"
              : "fail",
        description: null,
        link: check.url,
        name: check.name,
        state: check.state,
        workflow: "CI",
      })),
      hasPullRequest: true,
      pullRequest: {
        number: status.number,
        title: status.title,
        url: status.url,
        headRefName: status.headRefName,
      },
      summary: {
        fail: status.checks.filter((check) => check.state === "failure").length,
        other: 0,
        pass: status.checks.filter((check) => check.state === "success").length,
        pending: status.checks.filter((check) => check.state === "pending")
          .length,
        total: status.checks.length,
      },
    });
    return client;
  }, [mode]);

  const surface = useMemo(
    () =>
      ({
        active: true,
        activeTabId: "pr",
        addBrowserTab: () => {},
        addTerminalTab: () => {},
        api: {
          github: {
            listPrChecks: async () =>
              queryClient.getQueryData(queryKeys.github.prChecks(ROOT)),
            mergePullRequest: async () => ({
              merged: false,
              url: fixtureStatus(mode).url,
            }),
            prChecksFixPrompt: async () => {
              throw new Error("not used in fixture");
            },
            pullRequestStatus: async () => fixtureStatus(mode),
            resolveReviewThread: async () => ({ resolved: true }),
          },
          shepherd: {
            get: async () => ({ session: null }),
            resume: async () => ({ session: null }),
            start: async () => ({ session: null }),
            stop: async () => ({ session: null }),
          },
        },
        chatId: "fixture-chat",
        clearPullRequestFocusSection: () => {},
        closeDynamicTab: () => {},
        contextKey: "fixture",
        host: "sidebar" as const,
        openBrowserTab: () => {},
        openFileTab: () => {},
        pullRequestFocusSection: null,
        requestSurfaceHost: async () => {},
        root: ROOT,
        selectTab: async () => true,
        tabItems: [],
        updateSnapshot: () => {},
      }) as unknown as WorkspaceToolSurfaceModel,
    [mode, queryClient],
  );

  return (
    <div className="flex h-screen w-full justify-end bg-background p-4">
      <div
        className="h-full w-[360px] overflow-hidden rounded-xl border border-border-subtle bg-card shadow-sm"
        data-testid="dev-pr-panel-fixture"
      >
        <FixtureProviders queryClient={queryClient} surface={surface}>
          <PullRequestPanel root={ROOT} />
        </FixtureProviders>
      </div>
    </div>
  );
};

function FixtureProviders({
  children,
  queryClient,
  surface,
}: {
  children: ReactNode;
  queryClient: QueryClient;
  surface: WorkspaceToolSurfaceModel;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceToolSurfaceProvider model={surface}>
        {children}
      </WorkspaceToolSurfaceProvider>
    </QueryClientProvider>
  );
}
