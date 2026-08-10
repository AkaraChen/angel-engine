// @vitest-environment jsdom

import type { ShepherdSession } from "@angel-engine/daemon-api/shepherd";
import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";
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

import { ShepherdSection } from "./shepherd-section";

const prStatus = {
  state: "OPEN",
  url: "https://github.com/acme/widgets/pull/42",
  number: 42,
} as GitHubPullRequestStatus;

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
        <ShepherdSection status={prStatus} />
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
        <ShepherdSection status={prStatus} />
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
        <ShepherdSection status={prStatus} />
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
        <ShepherdSection status={prStatus} />
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
