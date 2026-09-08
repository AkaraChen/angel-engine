// @vitest-environment jsdom

import type { AgentSettings } from "@angel-engine/daemon-api/agents";
import type { ChatRuntimeConfig } from "@angel-engine/daemon-api/chat";
import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getApiClient } from "@/platform/api-client";
import { useWorkspacePageModel } from "./use-workspace-page-model";

const mocks = vi.hoisted(() => ({
  chooseDirectory: vi.fn<() => Promise<string | null>>(),
  inspectConfig:
    vi.fn<
      (input: { cwd?: string; runtime?: string }) => Promise<ChatRuntimeConfig>
    >(),
  listChats: vi.fn(),
  listProjects: vi.fn(),
  prewarm: vi.fn(),
  setActiveChatRunId: vi.fn(),
}));

const agentSettings: AgentSettings = {
  agentOrder: ["codex"],
  enabledRuntimes: ["codex"],
  lastRuntime: "codex",
  runtimePreferences: {},
};

const runtimeConfig: ChatRuntimeConfig = {
  canSetMode: true,
  canSetModel: true,
  canSetPermissionMode: true,
  canSetReasoningEffort: true,
  currentMode: null,
  currentModel: null,
  currentPermissionMode: null,
  currentReasoningEffort: null,
  modes: [],
  models: [],
  permissionModes: [],
  reasoningEfforts: [],
};

vi.mock("@/platform/api-client", () => ({
  getApiClient: () => ({
    chats: {
      inspectConfig: mocks.inspectConfig,
      list: mocks.listChats,
      prewarm: mocks.prewarm,
    },
    projects: {
      chooseDirectory: mocks.chooseDirectory,
      list: mocks.listProjects,
    },
  }),
}));

vi.mock("@/features/agents/agent-catalog-context", () => ({
  useAgentCatalog: () => ({
    availableAgentOptions: [{ description: "", id: "codex", label: "Codex" }],
  }),
}));

vi.mock("@/features/settings/use-agent-settings", () => ({
  useAgentSettings: () => [agentSettings, vi.fn()],
}));

vi.mock("@/features/chat/state/chat-run-store", () => ({
  setActiveChatRunId: mocks.setActiveChatRunId,
  useChatAttentionSummary: () => ({ completed: false, needsInput: false }),
  useChatRunConfig: () => undefined,
  useChatRunIsRunning: () => false,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function renderStandaloneModel() {
  return renderHook(
    () =>
      useWorkspacePageModel({
        api: getApiClient(),
      }),
    { wrapper },
  );
}

beforeEach(() => {
  mocks.chooseDirectory.mockReset();
  mocks.inspectConfig.mockReset();
  mocks.listChats.mockReset();
  mocks.listProjects.mockReset();
  mocks.prewarm.mockReset();
  mocks.setActiveChatRunId.mockReset();

  mocks.chooseDirectory.mockResolvedValue(null);
  mocks.inspectConfig.mockResolvedValue(runtimeConfig);
  mocks.listChats.mockResolvedValue([]);
  mocks.listProjects.mockResolvedValue([]);
  mocks.prewarm.mockResolvedValue({
    config: runtimeConfig,
    prewarmId: "prewarm-1",
  });

  Object.defineProperty(window, "desktopEnvironment", {
    configurable: true,
    value: { platform: "linux" },
  });
  Object.defineProperty(window, "desktopWindow", {
    configurable: true,
    value: {
      onOpenChatFromNotification: () => () => {},
      setActiveChatId: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useWorkspacePageModel standalone cwd selection", () => {
  it("updates pinned cwd and inspects runtime config with the selected folder", async () => {
    mocks.chooseDirectory.mockResolvedValue("/tmp/standalone-chat");
    const { result } = renderStandaloneModel();

    await act(async () => {
      await result.current.selectDraftFolder();
    });

    expect(result.current.pinnedDraftCwd).toBe("/tmp/standalone-chat");
    await waitFor(() => {
      expect(mocks.inspectConfig).toHaveBeenCalledWith({
        cwd: "/tmp/standalone-chat",
        runtime: "codex",
      });
    });
  });

  it("keeps the selected cwd when the folder dialog is cancelled", async () => {
    mocks.chooseDirectory
      .mockResolvedValueOnce("/tmp/keep-this-folder")
      .mockResolvedValueOnce(null);
    const { result } = renderStandaloneModel();

    await act(async () => {
      await result.current.selectDraftFolder();
    });
    await waitFor(() =>
      expect(result.current.pinnedDraftCwd).toBe("/tmp/keep-this-folder"),
    );

    await act(async () => {
      await result.current.selectDraftFolder();
    });

    expect(result.current.pinnedDraftCwd).toBe("/tmp/keep-this-folder");
    expect(mocks.chooseDirectory).toHaveBeenCalledTimes(2);
  });
});
