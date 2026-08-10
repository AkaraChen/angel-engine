import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import type { ReactNode } from "react";

import {
  DaemonRequestError,
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
import { ProjectsSection } from "@/features/settings/projects-section";
import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  createCustomAgent: vi.fn(),
  createProject: vi.fn(),
  deleteCustomAgent: vi.fn(),
  deleteCustomAgentImpact: vi.fn(),
  deleteProject: vi.fn(),
  deleteProjectImpact: vi.fn(),
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
    deleteImpact: mocks.deleteProjectImpact,
    list: mocks.listProjects,
    update: mocks.updateProject,
  },
} as unknown as DaemonClient;

vi.mock("@/platform/daemon-provider", () => ({
  useDaemonClient: () => daemon,
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

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
  mocks.deleteProject.mockResolvedValue({
    deletedChatCount: 2,
    deletedWorktreeCount: 0,
  });
  mocks.deleteProjectImpact.mockResolvedValue({
    chatCount: 2,
    revision: "rev-project-1",
  });
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
    const pathInput = screen.getByLabelText("Folder path");
    expect(pathInput.getAttribute("autocapitalize")).toBe("off");
    expect(pathInput.getAttribute("autocomplete")).toBe("off");
    expect(pathInput.getAttribute("autocorrect")).toBe("off");
    expect(pathInput.getAttribute("spellcheck")).toBe("false");
    fireEvent.change(pathInput, {
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
    // Pristine edit: Save stays disabled until a real valid change exists.
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Folder path"), {
      target: { value: "/workspace/renamed-project" },
    });
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
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
      expect(mocks.deleteProject).toHaveBeenCalledWith({
        expectedRevision: "rev-project-1",
        id: "project-1",
      });
    });
  });

  it.each([
    {
      chatCount: 0,
      message: /This project has no linked chats\./,
      name: "no linked chats",
    },
    {
      chatCount: 1,
      message: /permanently delete 1 linked chat\./,
      name: "one linked chat",
    },
  ])("shows the correct delete impact for $name", async (testCase) => {
    mocks.deleteProjectImpact.mockResolvedValue({
      chatCount: testCase.chatCount,
      revision: "rev-project-1",
    });

    renderWithQueryClient(<ProjectsSection />);
    await screen.findByText("old-project");
    fireEvent.click(screen.getByRole("button", { name: "Delete old-project" }));

    expect(
      await within(await screen.findByRole("alertdialog")).findByText(
        testCase.message,
      ),
    ).toBeDefined();
  });

  it("shows a conflict notice and re-reads the impact when the project changed", async () => {
    mocks.deleteProject.mockRejectedValueOnce(
      DaemonRequestError.http(
        409,
        "project-delete-conflict",
        "The project changed after the delete impact was read.",
      ),
    );

    renderWithQueryClient(<ProjectsSection />);
    await screen.findByText("old-project");
    fireEvent.click(screen.getByRole("button", { name: "Delete old-project" }));
    const deleteDialog = await screen.findByRole("alertdialog");
    await within(deleteDialog).findByText(/2 linked chats/);
    fireEvent.click(
      within(deleteDialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining("changed"),
      );
    });
    // The dialog stays open and the impact is re-read for a fresh revision.
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.deleteProjectImpact).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps Save disabled for a pristine edit and names missing fields on blur", async () => {
    renderWithQueryClient(<ProjectsSection />);
    await screen.findByText("old-project");
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));

    const pathInput = screen.getByLabelText("Folder path");
    // Pristine create: disabled with no error until the field is touched.
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();

    // Blurring an untouched empty field shows the associated inline error.
    fireEvent.blur(pathInput);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Enter a folder path.",
    );
    expect(pathInput.getAttribute("aria-invalid")).toBe("true");
    expect(pathInput.getAttribute("aria-describedby")).toBe(
      "project-path-error",
    );

    // Correction clears the error and enables Save.
    fireEvent.change(pathInput, { target: { value: "/workspace/new" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("shows project path validation inline and keeps the form open", async () => {
    mocks.createProject.mockRejectedValueOnce(
      DaemonRequestError.http(
        400,
        "project-path-invalid",
        "Project path does not exist.",
      ),
    );

    renderWithQueryClient(<ProjectsSection />);
    await screen.findByText("old-project");
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    const pathInput = screen.getByLabelText("Folder path");
    fireEvent.change(pathInput, {
      target: { value: "/workspace/missing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Enter a path to an existing folder.",
    );
    expect(pathInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.change(pathInput, {
      target: { value: "/workspace/another" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
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

  it("keeps Save disabled for a pristine agent edit until a real change", async () => {
    renderWithQueryClient(<CustomAgentsSection />);
    await screen.findByText("Test agent");
    fireEvent.click(screen.getByRole("button", { name: "Edit Test agent" }));

    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "renamed-agent" },
    });
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("names missing agent fields on blur and keeps the precise daemon error near Save", async () => {
    mocks.createCustomAgent.mockRejectedValueOnce(
      DaemonRequestError.http(
        400,
        "custom-agent-field-required",
        "Label is required.",
      ),
    );

    renderWithQueryClient(<CustomAgentsSection />);
    await screen.findByText("Test agent");
    fireEvent.click(screen.getByRole("button", { name: "Add custom agent" }));

    const commandInput = screen.getByLabelText("Command");
    // Blur validation names the missing field and links it to the input.
    fireEvent.blur(commandInput);
    const commandError = await screen.findByRole("alert");
    expect(commandError.textContent).toBe("Enter a command.");
    expect(commandInput.getAttribute("aria-invalid")).toBe("true");
    expect(commandInput.getAttribute("aria-describedby")).toBe(
      "custom-agent-command-error",
    );

    // Correction clears the field error; entered data is preserved.
    fireEvent.change(commandInput, { target: { value: "local-agent" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Local agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The precise daemon message stays near the action for correction/retry.
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Label is required.",
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Local agent",
    );

    // Retry succeeds and closes the drawer.
    await waitFor(() => {
      expect(mocks.createCustomAgent).toHaveBeenCalledOnce();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.createCustomAgent).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
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
