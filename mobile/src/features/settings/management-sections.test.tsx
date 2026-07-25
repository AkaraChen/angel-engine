import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import type { DaemonClient } from "@angel-engine/daemon-client";
import type { ReactNode } from "react";

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
import { ProjectsSection } from "@/features/settings/projects-section";
import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  createCustomAgent: vi.fn(),
  createProject: vi.fn(),
  deleteCustomAgent: vi.fn(),
  deleteCustomAgentImpact: vi.fn(),
  deleteProject: vi.fn(),
  listArchivedChats: vi.fn(),
  listChats: vi.fn(),
  listCustomAgents: vi.fn(),
  listProjects: vi.fn(),
  updateCustomAgent: vi.fn(),
  updateProject: vi.fn(),
}));

const daemon = {
  agents: {
    createCustom: mocks.createCustomAgent,
    deleteCustom: mocks.deleteCustomAgent,
    deleteCustomImpact: mocks.deleteCustomAgentImpact,
    listCustom: mocks.listCustomAgents,
    updateCustom: mocks.updateCustomAgent,
  },
  chats: {
    archivedList: mocks.listArchivedChats,
    list: mocks.listChats,
  },
  projects: {
    create: mocks.createProject,
    delete: mocks.deleteProject,
    list: mocks.listProjects,
    update: mocks.updateProject,
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
  mocks.listProjects.mockResolvedValue([
    { id: "project-1", path: "/workspace/old-project" },
  ]);
  mocks.createProject.mockResolvedValue({
    id: "project-2",
    path: "/workspace/new-project",
  });
  mocks.updateProject.mockResolvedValue({
    id: "project-1",
    path: "/workspace/renamed-project",
  });
  mocks.deleteProject.mockResolvedValue({ ok: true });
  mocks.listChats.mockResolvedValue([
    { id: "chat-1", projectId: "project-1" },
    { id: "chat-2", projectId: null },
  ]);
  mocks.listArchivedChats.mockResolvedValue([
    { id: "chat-3", projectId: "project-1" },
  ]);

  mocks.listCustomAgents.mockResolvedValue([customAgent]);
  mocks.createCustomAgent.mockResolvedValue(customAgent);
  mocks.updateCustomAgent.mockResolvedValue(customAgent);
  mocks.deleteCustomAgentImpact.mockResolvedValue({ chatCount: 3 });
  mocks.deleteCustomAgent.mockResolvedValue({ deletedChatIds: [] });
});

afterEach(() => {
  cleanup();
});

describe("ProjectsSection", () => {
  it("creates, edits, and deletes projects with linked-chat impact", async () => {
    renderWithQueryClient(<ProjectsSection />);
    await screen.findByText("old-project");

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.change(screen.getByLabelText("Folder path"), {
      target: { value: "/workspace/new-project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        path: "/workspace/new-project",
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit old-project" }));
    fireEvent.change(screen.getByLabelText("Folder path"), {
      target: { value: "/workspace/renamed-project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.updateProject).toHaveBeenCalledWith({
        id: "project-1",
        path: "/workspace/renamed-project",
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete old-project" }));
    const deleteDialog = await screen.findByRole("alertdialog");
    expect(
      await within(deleteDialog).findByText(/2 linked chats/),
    ).toBeDefined();
    fireEvent.click(
      within(deleteDialog).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(mocks.deleteProject).toHaveBeenCalledWith("project-1");
    });
  });
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.createCustomAgent).toHaveBeenCalledWith({
        args: ["acp", "--stdio"],
        command: "local-agent",
        environment: [
          { name: "TOKEN", value: "secret" },
          { name: "EMPTY", value: "" },
        ],
        label: "Local agent",
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
        command: "old-agent",
        environment: [{ name: "TOKEN", value: "old" }],
        id: "custom:test",
        label: "Updated agent",
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
});
