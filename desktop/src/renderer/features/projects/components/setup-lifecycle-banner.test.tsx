// @vitest-environment jsdom

import type { ProjectSetupLifecycleView } from "@angel-engine/daemon-api/projects";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetupLifecycleBanner } from "./setup-lifecycle-banner";

const lifecycle = vi.fn<() => Promise<ProjectSetupLifecycleView>>();
const retrySetup = vi.fn();
const continueSetup = vi.fn();
const discardSetup = vi.fn();
const cancelSetup = vi.fn();
const gitStatus = vi.fn();

vi.mock("@/platform/api-client", () => ({
  getApiClient: () => ({
    chats: {
      cancelSetup,
      continueSetup,
      discardSetup,
      lifecycle,
      retrySetup,
    },
    projects: { gitStatus },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("SetupLifecycleBanner", () => {
  it("shows deterministic running progress and lifecycle log selectors", async () => {
    lifecycle.mockResolvedValue(
      view({
        command: "bun install",
        status: "running",
        step: 1,
        stepCount: 2,
      }),
    );
    renderBanner();

    expect(await screen.findByTestId("lifecycle-banner")).toBeDefined();
    expect(screen.getByTestId("lifecycle-banner-step")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "workspace.setup.viewLog" }),
    );
    expect(screen.getByTestId("lifecycle-pane").textContent).toContain(
      "installing",
    );
  }, 15_000);

  it("exposes Retry, Continue anyway, and Discard on failure", async () => {
    lifecycle.mockResolvedValue(
      view({
        command: "bun install",
        failure: {
          exitCode: 7,
          message: "failed",
          reason: "exit",
          signal: null,
        },
        status: "failed",
        step: 1,
        stepCount: 1,
      }),
    );
    renderBanner();

    expect(await screen.findByTestId("lifecycle-error-card")).toBeDefined();
    expect(screen.getByTestId("lifecycle-retry")).toBeDefined();
    expect(screen.getByTestId("lifecycle-continue")).toBeDefined();
    expect(screen.getByTestId("lifecycle-discard")).toBeDefined();
  });

  it("re-approves the current setup digest before retrying", async () => {
    lifecycle.mockResolvedValue(failedView());
    gitStatus.mockResolvedValue({
      isDirty: true,
      isGitRepository: true,
      path: "/project",
      projectId: "project-1",
      worktreeSetup: {
        commands: ["bun install --fixed"],
        digest: "new-digest",
      },
    });
    retrySetup.mockResolvedValue(
      view({
        command: "bun install --fixed",
        status: "running",
        step: 1,
        stepCount: 1,
      }),
    );
    renderBanner();

    fireEvent.click(await screen.findByTestId("lifecycle-retry"));
    expect(
      await screen.findByText("workspace.worktreeSetupTitle"),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "workspace.setup.retry" }),
    );

    await waitFor(() =>
      expect(retrySetup).toHaveBeenCalledWith("chat-1", {
        setupApproval: "new-digest",
      }),
    );
  });

  it("does not discard when destructive confirmation is cancelled", async () => {
    lifecycle.mockResolvedValue(failedView());
    renderBanner();

    fireEvent.click(await screen.findByTestId("lifecycle-discard"));
    expect(
      await screen.findByText("workspace.setup.discardConfirmTitle"),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(discardSetup).not.toHaveBeenCalled();
  });

  it("discards the complete workspace only after confirmation", async () => {
    lifecycle.mockResolvedValue(failedView());
    discardSetup.mockResolvedValue({ ok: true });
    const onDiscarded = vi.fn();
    renderBanner(onDiscarded);

    fireEvent.click(await screen.findByTestId("lifecycle-discard"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "workspace.setup.discardConfirm",
      }),
    );

    await waitFor(() => expect(discardSetup).toHaveBeenCalledWith("chat-1"));
    await waitFor(() => expect(onDiscarded).toHaveBeenCalledOnce());
  });

  it("hides the ready banner after three seconds while retaining its log", async () => {
    vi.useFakeTimers();
    lifecycle.mockResolvedValue(
      view({ completedAt: "2026-08-10T00:00:00.000Z", status: "ready" }),
    );
    renderBanner();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("lifecycle-banner")).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(screen.queryByTestId("lifecycle-banner")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "workspace.setup.viewLog" }),
    );
    expect(screen.getByTestId("lifecycle-pane").textContent).toContain(
      "installing",
    );
  });
});

function renderBanner(onDiscarded = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SetupLifecycleBanner
        chatId="chat-1"
        enabled
        onDiscarded={onDiscarded}
        projectId="project-1"
      />
    </QueryClientProvider>,
  );
}

function failedView(): ProjectSetupLifecycleView {
  return view({
    command: "bun install",
    failure: {
      exitCode: 7,
      message: "failed",
      reason: "exit",
      signal: null,
    },
    status: "failed",
    step: 1,
    stepCount: 1,
  });
}

function view(
  setup: ProjectSetupLifecycleView["snapshot"]["setup"],
): ProjectSetupLifecycleView {
  return {
    continued: false,
    log: "installing",
    running: setup.status === "running",
    snapshot: {
      run: { status: "stopped" },
      setup,
      teardown: { status: "idle" },
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  };
}
