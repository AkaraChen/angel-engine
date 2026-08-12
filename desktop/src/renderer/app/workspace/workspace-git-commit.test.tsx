// @vitest-environment jsdom

import type { ApiClient } from "@/platform/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const publishBranch = vi.fn(async () => ({
  branch: "feature",
  remoteName: "origin",
  upstream: "origin/feature",
}));
const gitPush = vi.fn();
let activation = activationView("unresolved");

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => activation,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { useWorkspaceGitPanelState } from "./workspace-git-commit";
import { WorkspaceGitStatusBar } from "./workspace-git-status-bar";

afterEach(() => {
  vi.clearAllMocks();
  activation = activationView("unresolved");
});

describe("workspace branch publishing", () => {
  it("makes no publish or legacy git-push request without an active provider", async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceGitPanelState(
          apiClient(),
          "/repo",
          null,
          "worktree",
          "project-1",
        ),
      { wrapper: queryWrapper() },
    );

    act(() => result.current.pushMutation.mutate("feature"));
    await waitFor(() => expect(result.current.pushMutation.isError).toBe(true));

    expect(publishBranch).not.toHaveBeenCalled();
    expect(gitPush).not.toHaveBeenCalled();
  });

  it("disables publish in the UI without provider capability", () => {
    render(
      <TooltipProvider>
        <WorkspaceGitStatusBar
          branchStatus={{
            ahead: 1,
            behind: 0,
            branch: "feature",
            detached: false,
            unborn: false,
          }}
          conflictedPaths={[]}
          dirtyCount={0}
          onPublishRemediate={vi.fn()}
          onPush={vi.fn()}
          publishCapabilities={{ entries: {} }}
          publishProviderActive={false}
          pushPending={false}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("publishes through the activated provider capability", async () => {
    activation = activationView("active");
    const { result } = renderHook(
      () =>
        useWorkspaceGitPanelState(
          apiClient(),
          "/repo",
          null,
          "worktree",
          "project-1",
        ),
      { wrapper: queryWrapper() },
    );

    act(() => result.current.pushMutation.mutate("feature"));
    await waitFor(() =>
      expect(result.current.pushMutation.isSuccess).toBe(true),
    );

    expect(publishBranch).toHaveBeenCalledWith({
      localBranch: "feature",
      projectPath: "/repo",
    });
    expect(gitPush).not.toHaveBeenCalled();
  });
});

function apiClient() {
  return {
    sourceControl: { publishBranch },
    workspaceTools: {
      gitDiff: vi.fn(async () => ({ isGitRepository: true })),
      gitPush,
    },
  } as unknown as ApiClient;
}

function activationView(status: "active" | "unresolved") {
  return {
    capabilities:
      status === "active"
        ? { entries: { "branches.publish": { supported: true } } }
        : { entries: {} },
    projectPath: "/repo",
    refetch: vi.fn(async () => undefined),
    status,
  } as const;
}

function queryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
