// @vitest-environment jsdom

import type { ShepherdSession } from "@angel-engine/daemon-api/shepherd";
import type { ChangeRequest } from "@angel-engine/daemon-api/source-control";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const getShepherd = vi.fn();
const startShepherd = vi.fn();
const stopShepherd = vi.fn();
const resumeShepherd = vi.fn();
const resolveLink = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { max?: number; round?: number }) => {
      if (key === "workspace.tools.pullRequest.shepherd.rounds") {
        return `${String(options?.round)} / ${String(options?.max)}`;
      }
      return key;
    },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => toast,
}));

vi.mock("@/app/workspace/workspace-tool-surface-model", () => ({
  useWorkspaceToolSurface: () => ({
    active: true,
    api: {
      sourceControl: { resolveLink },
      shepherd: {
        get: getShepherd,
        start: startShepherd,
        stop: stopShepherd,
        resume: resumeShepherd,
      },
    },
    chatId: "chat-1",
  }),
}));

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => ({
    capabilities: {
      entries: { "changeRequests.getByUrl": { supported: true } },
    },
    projectPath: "/workspace/widgets",
    refetch: vi.fn(),
    status: "active",
  }),
}));

import { ShepherdSection } from "./shepherd-section";

const repository = {
  displayPath: "acme/widgets",
  host: "github.com",
  name: "widgets",
  namespace: ["acme"],
  providerId: "github",
  remoteId: "1",
  webUrl: "https://github.com/acme/widgets",
} as const;
const changeRequest = {
  additions: null,
  allowedMergeMethods: ["squash"],
  author: null,
  body: "",
  changedFiles: null,
  commitCount: null,
  createdAt: null,
  defaultMergeMethod: "squash",
  deletions: null,
  draft: false,
  id: "42",
  mergeRequirements: [],
  mergedAt: null,
  number: 42,
  repository,
  reviewDecision: "none",
  source: { name: "feature", oid: "sha", repository },
  state: "open",
  target: { name: "main", oid: null, repository },
  title: "Feature",
  updatedAt: null,
  viewerCanMerge: true,
  webUrl: "https://github.com/acme/widgets/pull/42",
} satisfies ChangeRequest;

function session(overrides: Partial<ShepherdSession> = {}): ShepherdSession {
  return {
    id: "s1",
    chatId: "chat-1",
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    headSha: "sha",
    state: "watching",
    settledReason: null,
    holdReason: null,
    round: 3,
    maxRounds: 10,
    consecutiveNoProgress: 0,
    handledFingerprints: [],
    baselineSnapshot: null,
    pendingPrompt: null,
    pendingFingerprints: [],
    lastSentHeadSha: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function renderSection(next: ShepherdSession | null) {
  getShepherd.mockResolvedValue({ session: next });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ShepherdSection changeRequest={changeRequest} projectId="project-1" />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  toast.mockReset();
  getShepherd.mockReset();
  startShepherd.mockReset();
  stopShepherd.mockReset();
  resumeShepherd.mockReset();
  resolveLink.mockReset().mockResolvedValue(changeRequest);
  stopShepherd.mockImplementation(async ({ id }: { id: string }) =>
    session({ id, state: "settled", settledReason: "stopped" }),
  );
  resumeShepherd.mockImplementation(async ({ id }: { id: string }) =>
    session({ id, state: "watching", settledReason: null, holdReason: null }),
  );
  startShepherd.mockImplementation(async () => session({ state: "watching" }));
});

afterEach(() => {
  cleanup();
});

describe("ShepherdSection", () => {
  it("stacks the header and full-width action in a narrow panel", async () => {
    const view = renderSection(null);
    view.container.style.width = "246px";

    await waitFor(() => {
      expect(screen.getByTestId("shepherd-toggle")).toBeDefined();
    });

    expect(screen.getByTestId("shepherd-section").classList).toContain(
      "@container",
    );
    expect(screen.getByTestId("shepherd-header").className).toContain(
      "flex-col",
    );
    expect(screen.getByTestId("shepherd-header").className).toContain(
      "@[360px]:flex-row",
    );
    expect(screen.getByTestId("shepherd-toggle").className).toContain("w-full");
    expect(screen.getByTestId("shepherd-toggle").className).toContain(
      "@[360px]:w-auto",
    );
    expect(view.container.style.width).toBe("246px");
  });

  it("resolves the change-request URL before starting shepherd", async () => {
    renderSection(null);
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-toggle")).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("shepherd-toggle"));
    });

    await waitFor(() => {
      expect(resolveLink).toHaveBeenCalledWith(
        "/workspace/widgets",
        changeRequest.webUrl,
      );
      expect(startShepherd).toHaveBeenCalledWith({
        chatId: "chat-1",
        owner: "acme",
        prNumber: 42,
        repo: "widgets",
      });
    });
  });

  it("renders off, watching, queued, and settled states", async () => {
    renderSection(null);
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-toggle").textContent).toContain(
        "workspace.tools.pullRequest.shepherd.start",
      );
    });
    expect(screen.getByTestId("shepherd-rounds").textContent).toContain(
      "0 / 10",
    );

    cleanup();
    renderSection(session({ state: "watching", round: 2 }));
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-watching-pulse")).toBeTruthy();
      expect(screen.getByTestId("shepherd-rounds").textContent).toContain(
        "2 / 10",
      );
    });

    cleanup();
    renderSection(session({ state: "queued", round: 4 }));
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-queued")).toBeTruthy();
    });

    cleanup();
    renderSection(
      session({ state: "settled", settledReason: "green", round: 5 }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-settled-green")).toBeTruthy();
    });
  });

  it("shows daemon-projected hold reasons including queued_run", async () => {
    renderSection(session({ state: "watching", holdReason: "queued_run" }));
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-hold-queued_run")).toBeTruthy();
      expect(
        screen.getByText("workspace.tools.pullRequest.shepherd.hold.queuedRun"),
      ).toBeTruthy();
    });

    cleanup();
    renderSection(
      session({ state: "watching", holdReason: "waiting_for_you" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-hold-waiting_for_you")).toBeTruthy();
    });

    cleanup();
    renderSection(session({ state: "watching", holdReason: "ambiguous_run" }));
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-hold-ambiguous_run")).toBeTruthy();
    });
  });

  it("does not toast on manual stop", async () => {
    const stopped = session({ state: "settled", settledReason: "stopped" });
    getShepherd.mockResolvedValue({
      session: session({ state: "watching" }),
    });
    stopShepherd.mockResolvedValue(stopped);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ShepherdSection changeRequest={changeRequest} projectId="project-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("shepherd-toggle").textContent).toContain(
        "workspace.tools.pullRequest.shepherd.shepherdingStop",
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("shepherd-toggle"));
    });

    await waitFor(() => {
      expect(stopShepherd).toHaveBeenCalledWith({ id: "s1" });
    });

    // Apply the manual-stop result the mutation would write, then a follow-up
    // render observes settled/stopped without a yield toast.
    queryClient.setQueryData(["shepherd", "session", "chat-1"], {
      session: stopped,
    });
    await waitFor(() => {
      expect(screen.getByTestId("shepherd-settled-stopped")).toBeTruthy();
    });

    expect(
      toast.mock.calls.some(
        (call) =>
          call[0]?.title === "workspace.tools.pullRequest.shepherd.yielded",
      ),
    ).toBe(false);
  });

  it("toasts on passive yield and resume action works", async () => {
    let current: ShepherdSession = session({ state: "watching" });
    getShepherd.mockImplementation(async () => ({ session: current }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <ShepherdSection changeRequest={changeRequest} projectId="project-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("shepherd-watching-pulse")).toBeTruthy();
    });

    current = session({ state: "settled", settledReason: "yielded" });
    queryClient.setQueryData(["shepherd", "session", "chat-1"], {
      session: current,
    });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ShepherdSection changeRequest={changeRequest} projectId="project-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        toast.mock.calls.some(
          (call) =>
            call[0]?.title === "workspace.tools.pullRequest.shepherd.yielded",
        ),
      ).toBe(true);
    });

    const yieldCall = toast.mock.calls.find(
      (call) =>
        call[0]?.title === "workspace.tools.pullRequest.shepherd.yielded",
    );
    resumeShepherd.mockClear();
    await act(async () => {
      yieldCall?.[0]?.action?.onClick();
    });
    await waitFor(() => {
      expect(resumeShepherd).toHaveBeenCalledWith({ id: "s1" });
    });
  });
});
