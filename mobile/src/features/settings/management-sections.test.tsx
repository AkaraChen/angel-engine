import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import type { ReactNode } from "react";

import {
  type DaemonClient,
} from "@angel-engine/daemon-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomAgentsSection } from "@/features/settings/custom-agents-section";
import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  createCustomAgent: vi.fn(),
  deleteCustomAgent: vi.fn(),
  deleteCustomAgentImpact: vi.fn(),
  listCustomAgents: vi.fn(),
  updateCustomAgent: vi.fn(),
}));

const daemon = {
  agents: {
    createCustom: mocks.createCustomAgent,
    deleteCustom: mocks.deleteCustomAgent,
    deleteCustomImpact: mocks.deleteCustomAgentImpact,
    listCustom: mocks.listCustomAgents,
    updateCustom: mocks.updateCustomAgent,
  },
} as unknown as DaemonClient;

vi.mock("@/platform/daemon-provider", () => ({
  useDaemonClient: () => daemon,
}));

const customAgent = {
  args: ["acp"],
  autoAuthenticate: true,
  command: "old-agent",
  createdAt: "2026-01-01T00:00:00Z",
  environment: [{ name: "TOKEN", value: "old" }],
  id: "custom:test",
  label: "Test agent",
  needAuth: true,
  updatedAt: "2026-01-01T00:00:00Z",
} satisfies CustomAgent;

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  mocks.listCustomAgents.mockResolvedValue([customAgent]);
  mocks.createCustomAgent.mockResolvedValue(customAgent);
  mocks.updateCustomAgent.mockResolvedValue(customAgent);
  mocks.deleteCustomAgentImpact.mockResolvedValue({ chatCount: 3 });
  mocks.deleteCustomAgent.mockResolvedValue({ deletedChatIds: [] });
});

afterEach(() => {
  cleanup();
});

describe("CustomAgentsSection", () => {
  it("creates, edits, and deletes custom agents with daemon impact", async () => {
    renderWithQueryClient(<CustomAgentsSection />);
    await screen.findByText("Test agent");

    fireEvent.click(screen.getByRole("button", { name: "Add custom agent" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Local agent" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "local-agent" },
    });
    fireEvent.change(screen.getByLabelText("Arguments"), {
      target: { value: "acp\n--stdio" },
    });
    fireEvent.change(screen.getByLabelText("Environment"), {
      target: { value: "TOKEN=secret\nEMPTY" },
    });
    for (const label of ["Command", "Arguments", "Environment"]) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute("autocapitalize")).toBe("off");
      expect(input.getAttribute("autocorrect")).toBe("off");
      expect(input.getAttribute("spellcheck")).toBe("false");
    }
    fireEvent.click(
      screen.getByRole("switch", { name: "Requires authentication" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Authenticate automatically" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.createCustomAgent).toHaveBeenCalledWith({
        args: ["acp", "--stdio"],
        autoAuthenticate: true,
        command: "local-agent",
        environment: [
          { name: "TOKEN", value: "secret" },
          { name: "EMPTY", value: "" },
        ],
        label: "Local agent",
        needAuth: true,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Test agent" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Updated agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.updateCustomAgent).toHaveBeenCalledWith({
        args: ["acp"],
        autoAuthenticate: true,
        command: "old-agent",
        environment: [{ name: "TOKEN", value: "old" }],
        id: "custom:test",
        label: "Updated agent",
        needAuth: true,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Test agent" }));
    const deleteDialog = await screen.findByRole("alertdialog");
    expect(
      await within(deleteDialog).findByText(/3 linked chats/),
    ).toBeDefined();
    fireEvent.click(
      within(deleteDialog).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(mocks.deleteCustomAgent).toHaveBeenCalledWith("custom:test");
    });
  });

  it.each([
    {
      count: 0,
      message: /This agent has no linked chats\./,
      name: "no linked chats",
    },
    {
      count: 1,
      message: /permanently delete 1 linked chat\./,
      name: "one linked chat",
    },
  ])("shows the correct delete impact for $name", async (testCase) => {
    mocks.deleteCustomAgentImpact.mockResolvedValue({
      chatCount: testCase.count,
    });

    renderWithQueryClient(<CustomAgentsSection />);
    await screen.findByText("Test agent");
    fireEvent.click(screen.getByRole("button", { name: "Delete Test agent" }));

    expect(
      await within(await screen.findByRole("alertdialog")).findByText(
        testCase.message,
      ),
    ).toBeDefined();
  });
});
