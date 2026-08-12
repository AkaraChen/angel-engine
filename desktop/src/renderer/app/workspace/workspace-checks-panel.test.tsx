// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

const checksSummary = vi.fn();
const checksFixPrompt = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/app/workspace/workspace-tool-store", () => ({
  useWorkspaceToolStore: (
    selector: (state: { context: { chatId: string } }) => unknown,
  ) => selector({ context: { chatId: "chat-1" } }),
}));

vi.mock("@/features/chat/state/chat-run-store", () => ({
  useChatRunStore: (
    selector: (state: { startRun: ReturnType<typeof vi.fn> }) => unknown,
  ) => selector({ startRun: vi.fn() }),
}));

vi.mock("@/app/workspace/workspace-tool-surface-model", () => ({
  useWorkspaceToolSurface: () => ({
    active: true,
    api: { sourceControl: { checksFixPrompt, checksSummary } },
    openBrowserTab: vi.fn(),
  }),
}));

import { WorkspaceChecksSection } from "./workspace-checks-panel";

afterEach(() => {
  cleanup();
  checksSummary.mockReset();
  checksFixPrompt.mockReset();
});

describe("WorkspaceChecksSection", () => {
  it("keeps the compact caret styling when the checks section is toggled", async () => {
    checksSummary.mockResolvedValue({
      checks: [],
      failed: [],
      failedBlocking: [],
      hasPending: false,
      headOid: "head",
      requiredAllGreen: true,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WorkspaceChecksSection
            capabilities={{
              entries: { "checks.snapshot": { supported: true } },
            }}
            changeRequestId="42"
            projectPath="/repo"
            providerIdentity="provider:scm.example/acme/widgets:3"
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await screen.findByTestId("workspace-checks-section");
    expect(checksSummary).toHaveBeenCalledOnce();
    const button = screen.getByRole("button", {
      name: "workspace.tools.tabs.checks",
    });
    const expectCompactCaret = () => {
      const caret = button.querySelector("svg");
      expect(caret).not.toBeNull();
      expect(caret?.classList).toContain("size-3.5");
      expect(caret?.classList).toContain("shrink-0");
      expect(caret?.classList).toContain("text-muted-foreground");
    };
    expectCompactCaret();
    fireEvent.click(button);
    expectCompactCaret();
  });

  it("renders the capability reason and makes no business request when checks are unsupported", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WorkspaceChecksSection
            capabilities={{ entries: {} }}
            changeRequestId="42"
            projectPath="/repo"
            providerIdentity="gitlab:gitlab.example/acme/widgets:3"
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(
      (await screen.findByTestId("workspace-checks-unsupported")).textContent,
    ).toContain("Capability checks.snapshot was not declared by the provider.");
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(checksSummary).not.toHaveBeenCalled();
    expect(checksFixPrompt).not.toHaveBeenCalled();
  });
});
