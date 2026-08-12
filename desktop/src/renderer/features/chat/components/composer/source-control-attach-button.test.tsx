// @vitest-environment jsdom

import type {
  CapabilityMatrix,
  ChangeRequest,
  WorkItem,
} from "@angel-engine/daemon-api/source-control";
import type { FC, ReactNode } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ComposerSourceControlAttachment } from "./source-control-attachments";
import { PromptSourceControlAttachButton } from "./source-control-attach-button";

const repository = {
  displayPath: "acme/widgets",
  extensions: {},
  host: "github.com",
  name: "widgets",
  namespace: ["acme"],
  providerId: "github",
  remoteId: "1",
  webUrl: "https://github.com/acme/widgets",
} as const;
const actor = {
  avatarUrl: null,
  displayName: "Alice",
  extensions: {},
  id: "1",
  login: "alice",
  webUrl: null,
} as const;
const workItem: WorkItem = {
  assignees: [],
  author: actor,
  body: "Issue body",
  closedAt: null,
  createdAt: "2026-08-01T00:00:00Z",
  extensions: {},
  id: "1",
  kind: "issue",
  labels: [],
  number: 1,
  repository,
  state: "open",
  title: "First issue",
  updatedAt: "2026-08-02T00:00:00Z",
  webUrl: "https://github.com/acme/widgets/issues/1",
};
const changeRequest: ChangeRequest = {
  additions: null,
  allowedMergeMethods: ["squash"],
  author: actor,
  body: "Change body",
  changedFiles: null,
  commitCount: null,
  createdAt: "2026-08-01T00:00:00Z",
  defaultMergeMethod: "squash",
  deletions: null,
  draft: true,
  extensions: {},
  id: "7",
  mergeRequirements: [],
  mergedAt: null,
  number: 7,
  repository,
  reviewDecision: "none",
  source: { name: "feature/spinner", oid: null, repository },
  state: "open",
  target: { name: "main", oid: null, repository },
  title: "Add widget spinner",
  updatedAt: "2026-08-03T00:00:00Z",
  viewerCanMerge: true,
  webUrl: "https://github.com/acme/widgets/pull/7",
};
const supportedCapabilities: CapabilityMatrix = {
  entries: {
    "changeRequests.getByUrl": { supported: true },
    "changeRequests.list": { supported: true },
    "workItems.getByUrl": { supported: true },
    "workItems.list": { supported: true },
  },
};

const mocks = vi.hoisted(() => ({
  capabilities: { entries: {} } as CapabilityMatrix,
  listChangeRequests: vi.fn(),
  listWorkItems: vi.fn(),
  projectId: "project-1" as string | undefined,
  refetchActivation: vi.fn(),
  resolveUrl: vi.fn(),
  status: "active" as "active" | "unresolved",
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({
    sourceControl: {
      listChangeRequests: mocks.listChangeRequests,
      listWorkItems: mocks.listWorkItems,
      resolveLink: mocks.resolveUrl,
    },
  }),
}));

vi.mock("@/features/chat/runtime/chat-environment-context", () => ({
  useChatEnvironment: () => ({
    availableCommands: [],
    availableCommandsLoading: false,
    availableSkills: [],
    availableSkillsLoading: false,
    isProjectChat: mocks.projectId !== undefined,
    projectId: mocks.projectId,
  }),
}));

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => ({
    capabilities: mocks.capabilities,
    projectPath: mocks.status === "active" ? "/repos/widgets" : null,
    providerDisplayName: mocks.status === "active" ? "GitHub" : null,
    providerId: mocks.status === "active" ? "github" : null,
    providerIdentity:
      mocks.status === "active" ? "github:github.com/acme/widgets:4" : null,
    refetch: mocks.refetchActivation,
    status: mocks.status,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "composer.fromLink": "From link",
        "composer.fromLinkPlaceholder": "Search or paste a link",
      })[key] ?? key,
  }),
}));

vi.mock("@/components/ui/dialog", async () => {
  const { createContext, useContext } = await import("react");
  const Context = createContext<{
    onOpenChange(next: boolean): void;
    open: boolean;
  } | null>(null);
  const Dialog: FC<{
    children: ReactNode;
    onOpenChange(next: boolean): void;
    open: boolean;
  }> = ({ children, onOpenChange, open }) => (
    <Context.Provider value={{ onOpenChange, open }}>
      {children}
    </Context.Provider>
  );
  const DialogContent: FC<{ children: ReactNode }> = ({ children }) => {
    const dialog = useContext(Context);
    return dialog?.open ? <div role="dialog">{children}</div> : null;
  };
  const Passthrough: FC<{ children: ReactNode }> = ({ children }) => (
    <>{children}</>
  );
  return {
    Dialog,
    DialogContent,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  };
});

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverStub;
  Element.prototype.scrollIntoView = () => undefined;
  mocks.capabilities = supportedCapabilities;
  mocks.projectId = "project-1";
  mocks.status = "active";
  mocks.listWorkItems.mockReset().mockResolvedValue([workItem]);
  mocks.listChangeRequests.mockReset().mockResolvedValue([changeRequest]);
  mocks.resolveUrl.mockReset();
  mocks.refetchActivation.mockReset();
});

afterEach(cleanup);

describe("PromptSourceControlAttachButton", () => {
  it("lists generic work items and change requests and attaches their context", async () => {
    const onAttached =
      vi.fn<(attachment: ComposerSourceControlAttachment) => void>();
    renderButton(onAttached);
    openDialog();

    expect(await screen.findByText("First issue")).toBeDefined();
    expect(screen.getByText("Add widget spinner")).toBeDefined();
    expect(mocks.listWorkItems).toHaveBeenCalledWith(
      "/repos/widgets",
      undefined,
      30,
    );
    expect(mocks.listChangeRequests).toHaveBeenCalledWith(
      "/repos/widgets",
      undefined,
      30,
    );

    fireEvent.click(screen.getByText("Add widget spinner"));
    expect(onAttached).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "7",
        kind: "changeRequest",
        providerId: "github",
        sourceBranch: "feature/spinner",
        targetBranch: "main",
      }),
    );
    expect(mocks.resolveUrl).not.toHaveBeenCalled();
  }, 15_000);

  it("requests only capabilities that the active provider supports", async () => {
    mocks.capabilities = {
      entries: {
        "changeRequests.list": {
          reason: { kind: "not-implemented", message: "No change requests" },
          supported: false,
        },
        "workItems.list": { supported: true },
      },
    };
    renderButton(vi.fn());
    openDialog();

    expect(await screen.findByText("First issue")).toBeDefined();
    expect(mocks.listWorkItems).toHaveBeenCalledOnce();
    expect(mocks.listChangeRequests).not.toHaveBeenCalled();
  });

  it("keeps source-control daemon errors mapped to composer messages", async () => {
    mocks.listWorkItems.mockRejectedValue(
      DaemonRequestError.http(
        502,
        "source-control/fetch-failed",
        "provider details must not leak",
      ),
    );
    mocks.listChangeRequests.mockResolvedValue([]);
    renderButton(vi.fn());
    openDialog();

    const input = screen.getByPlaceholderText("Search or paste a link");
    await waitFor(() => expect(mocks.listWorkItems).toHaveBeenCalledOnce());
    fireEvent.blur(input);
    expect(
      await screen.findByText("composer.sourceControlErrors.fetchFailed"),
    ).toBeDefined();
    expect(screen.queryByText("provider details must not leak")).toBeNull();
  });

  it("resolves a non-GitHub URL through the active provider", async () => {
    const gitlabRepository = {
      ...repository,
      displayPath: "group/widgets",
      host: "gitlab.example.com",
      namespace: ["group"],
      providerId: "gitlab",
      webUrl: "https://gitlab.example.com/group/widgets",
    };
    const url = "https://gitlab.example.com/group/widgets/-/merge_requests/7";
    const resolved = {
      ...changeRequest,
      repository: gitlabRepository,
      source: { ...changeRequest.source, repository: gitlabRepository },
      target: { ...changeRequest.target, repository: gitlabRepository },
      webUrl: url,
    };
    mocks.resolveUrl.mockResolvedValue(resolved);
    const onAttached = vi.fn();
    renderButton(onAttached);
    openDialog();

    fireEvent.change(screen.getByPlaceholderText("Search or paste a link"), {
      target: { value: url },
    });

    await waitFor(() =>
      expect(mocks.resolveUrl).toHaveBeenCalledWith("/repos/widgets", url),
    );
    expect(await screen.findByText("Add widget spinner")).toBeDefined();
    fireEvent.click(screen.getByText("composer.attachGitHubConfirm"));
    expect(onAttached).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "changeRequest",
        providerId: "gitlab",
        repositoryPath: "group/widgets",
      }),
    );
  });

  it("fails closed with a disabled reason and zero business requests", () => {
    mocks.status = "unresolved";
    mocks.capabilities = { entries: {} };
    renderButton(vi.fn());

    const trigger = screen.getByTitle("From link");
    expect(trigger.getAttribute("disabled")).not.toBeNull();
    expect(
      trigger.closest("[data-capability]")?.getAttribute("data-capability"),
    ).toBe("workItems.getByUrl");
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.listWorkItems).not.toHaveBeenCalled();
    expect(mocks.listChangeRequests).not.toHaveBeenCalled();
    expect(mocks.resolveUrl).not.toHaveBeenCalled();
  });

  it("does not render outside a project chat", () => {
    mocks.projectId = undefined;
    renderButton(vi.fn());
    expect(screen.queryByTitle("From link")).toBeNull();
  });
});

function renderButton(
  onAttached: (attachment: ComposerSourceControlAttachment) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PromptSourceControlAttachButton onAttached={onAttached} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByTitle("From link"));
  expect(screen.getByRole("dialog")).toBeDefined();
}
