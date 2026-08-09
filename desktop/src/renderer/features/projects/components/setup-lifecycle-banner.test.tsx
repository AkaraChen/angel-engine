// @vitest-environment jsdom

import type { ProjectSetupLifecycleView } from "@angel-engine/daemon-api/projects";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetupLifecycleBanner } from "./setup-lifecycle-banner";

const lifecycle = vi.fn<() => Promise<ProjectSetupLifecycleView>>();
const retrySetup = vi.fn();
const continueSetup = vi.fn();
const discardSetup = vi.fn();
const cancelSetup = vi.fn();

vi.mock("@/platform/api-client", () => ({
  getApiClient: () => ({
    chats: {
      cancelSetup,
      continueSetup,
      discardSetup,
      lifecycle,
      retrySetup,
    },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
});

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SetupLifecycleBanner chatId="chat-1" enabled onDiscarded={vi.fn()} />
    </QueryClientProvider>,
  );
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
