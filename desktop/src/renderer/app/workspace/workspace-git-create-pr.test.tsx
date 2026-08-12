// @vitest-environment jsdom

import type { CapabilityMatrix } from "@angel-engine/daemon-api/source-control";
import type { ApiClient } from "@/platform/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

const refetchActivation = vi.fn(async () => undefined);
let activation = activationView("active");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => activation,
}));

vi.mock("@/app/workspace/workspace-pull-request-preview", () => ({
  WorkspacePullRequestPreviewDialog: () => null,
}));

vi.mock("@/app/workspace/workspace-tool-layout", () => ({
  WorkspaceToolBanner: ({ children }: PropsWithChildren) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/app/workspace/workspace-tool-surface-model", () => ({
  useWorkspaceToolSurface: () => ({ selectTab: vi.fn() }),
}));

import {
  useWorkspaceGitPullRequestPreflight,
  WorkspaceGitPullRequestAction,
} from "./workspace-git-create-pr";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  activation = activationView("active");
});

describe("workspace create change request", () => {
  it("keeps preflight head, base, ahead, existing, and push state", async () => {
    const changeRequestPreflight = vi.fn(async () => ({
      aheadCount: 2,
      availableTargetBranches: ["main", "release"],
      existing: null,
      needsPush: true,
      requirements: [],
      sourceBranch: "agent/hexa/feature",
      targetBranch: "main",
    }));
    const changeRequestTemplate = vi.fn(async () => ({
      body: "Template body",
      templates: [],
    }));
    const api = {
      sourceControl: { changeRequestPreflight, changeRequestTemplate },
    } as unknown as ApiClient;

    const { result } = renderHook(
      () => useWorkspaceGitPullRequestPreflight(api, "project-1"),
      { wrapper: queryWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({
      aheadCount: 2,
      availableBaseBranches: ["main", "release"],
      base: "main",
      body: "Template body",
      existing: null,
      head: "agent/hexa/feature",
      needsPush: true,
    });
    expect(changeRequestPreflight).toHaveBeenCalledWith("/repo", undefined);
  });

  it("makes zero business requests when activation is not active", async () => {
    activation = activationView("unresolved");
    const changeRequestPreflight = vi.fn();
    const changeRequestTemplate = vi.fn();
    const api = {
      sourceControl: { changeRequestPreflight, changeRequestTemplate },
    } as unknown as ApiClient;

    const { result } = renderHook(
      () => useWorkspaceGitPullRequestPreflight(api, "project-1"),
      { wrapper: queryWrapper() },
    );
    await Promise.resolve();
    await act(async () => result.current.refetch());

    expect(changeRequestPreflight).not.toHaveBeenCalled();
    expect(changeRequestTemplate).not.toHaveBeenCalled();
  });

  it("disables creation through CapabilityGate with authentication remediation", () => {
    const capabilities: CapabilityMatrix = {
      entries: {
        "changeRequests.create": {
          supported: false,
          reason: {
            kind: "unauthenticated",
            message: "Authenticate with the provider.",
          },
        },
      },
    };

    render(
      <TooltipProvider>
        <WorkspaceGitPullRequestAction
          capabilities={capabilities}
          providerActive
          onRemediate={() => void refetchActivation()}
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole("button", {
      name: "workspace.tools.createPullRequest.short",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      document.querySelector('[data-capability="changeRequests.create"]'),
    ).not.toBeNull();
  });
});

function queryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function activationView(status: "active" | "unresolved") {
  const capabilities: CapabilityMatrix = {
    entries: {
      "changeRequests.create": { supported: true },
      "changeRequests.list": { supported: true },
      "changeRequests.preflight": { supported: true },
      repositoryIdentity: { supported: true },
    },
  };
  return {
    capabilities,
    projectPath: status === "active" ? "/repo" : null,
    providerIdentity:
      status === "active" ? "forge:forge.com/acme/widgets:1" : null,
    refetch: refetchActivation,
    status,
  };
}
