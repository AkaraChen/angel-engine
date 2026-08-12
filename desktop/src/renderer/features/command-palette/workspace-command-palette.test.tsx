// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";
import type { CommandId } from "@shared/keybindings";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useEffect } from "react";

const commandHandlers = new Map<CommandId, (args?: unknown) => unknown>();

const toolContext = {
  chatId: "chat-1" as string | null,
  contextKey: "ctx-1" as string | null,
  projectId: "project-1" as string | null,
  root: "/tmp/repo-1" as string | null,
};

const startShepherd = vi.fn();
const stopShepherd = vi.fn();
const getShepherd = vi.fn();
const currentChangeRequest = vi.fn();
const resolveLink = vi.fn();
const toast = vi.fn();
const updateWorkspaceToolSnapshot = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/**
 * Palette opens via central keymap (`palette.open`). Mock the provider hooks so
 * this unit test does not pull KeymapProvider → tipc / ipcRenderer.
 */
vi.mock("@/platform/keymap/provider", () => ({
  useCommand: (
    id: CommandId,
    handler: (args?: unknown) => unknown,
    deps: unknown[],
  ) => {
    useEffect(() => {
      commandHandlers.set(id, handler);
      return () => {
        if (commandHandlers.get(id) === handler) {
          commandHandlers.delete(id);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, handler, ...deps]);
  },
  useContextKey: () => {},
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({
    sourceControl: {
      currentChangeRequest,
      resolveLink,
    },
    shepherd: {
      get: getShepherd,
      start: startShepherd,
      stop: stopShepherd,
    },
  }),
}));

const activation = {
  capabilities: {
    entries: {
      "changeRequests.getByUrl": { supported: true as const },
      "changeRequests.list": { supported: true as const },
      "changeRequests.status": { supported: true as const },
    },
  },
  projectPath: "/tmp/repo-1",
  providerIdentity: "github:github.com/acme/widgets:1",
  status: "active" as "active" | "unresolved",
};

vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => activation,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => toast,
}));

vi.mock("@/app/workspace/workspace-ui-store", () => ({
  useWorkspaceUiStore: (
    selector: (state: { setRightSidebarOpen: () => void }) => unknown,
  ) => selector({ setRightSidebarOpen: vi.fn() }),
}));

vi.mock("@/app/workspace/workspace-tool-store", () => ({
  useWorkspaceToolStore: (
    selector: (state: {
      context: typeof toolContext;
      updateWorkspaceToolSnapshot: typeof updateWorkspaceToolSnapshot;
    }) => unknown,
  ) =>
    selector({
      context: toolContext,
      updateWorkspaceToolSnapshot,
    }),
  workspaceToolPullRequestTabId: "pr",
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useMutation: (options: {
      mutationFn: (input: unknown) => Promise<unknown>;
    }) => ({
      isPending: false,
      mutateAsync: (input: unknown) => options.mutationFn(input),
    }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
    }),
  };
});

import { WorkspaceCommandPalette } from "./workspace-command-palette";

class TestResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

const originalResizeObserver = Object.getOwnPropertyDescriptor(
  globalThis,
  "ResizeObserver",
);
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
  writable: true,
});
const originalDesktopEnvironment = Object.getOwnPropertyDescriptor(
  window,
  "desktopEnvironment",
);
Object.defineProperty(window, "desktopEnvironment", {
  configurable: true,
  value: {
    getPathForFile: () => null,
    platform: "win32",
  },
  writable: true,
});
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);
Element.prototype.scrollIntoView = vi.fn();

const chat: Chat = {
  archived: false,
  createdAt: "2026-08-09T00:00:00.000Z",
  cwd: "/workspace/angel-engine",
  id: "chat-1",
  pinned: false,
  projectId: "project-1",
  remoteThreadId: null,
  runtime: "codex",
  title: "Build command palette",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

async function openPaletteViaCommand() {
  await waitFor(() => {
    expect(commandHandlers.get("palette.open")).toBeTypeOf("function");
  });
  await act(async () => {
    commandHandlers.get("palette.open")?.();
  });
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeDefined();
  });
}

beforeEach(() => {
  window.desktopEnvironment.platform = "win32";
  commandHandlers.clear();
  toolContext.chatId = "chat-1";
  toolContext.contextKey = "ctx-1";
  toolContext.projectId = "project-1";
  toolContext.root = "/tmp/repo-1";
  activation.projectPath = "/tmp/repo-1";
  activation.status = "active";
  startShepherd.mockReset();
  stopShepherd.mockReset();
  getShepherd.mockReset();
  currentChangeRequest.mockReset();
  resolveLink.mockReset();
  toast.mockReset();
  updateWorkspaceToolSnapshot.mockReset();
  getShepherd.mockResolvedValue({ session: null });
  const changeRequest = {
    id: "1",
    number: 1,
    repository: { name: "widgets", namespace: ["acme"] },
    source: { name: "feature" },
    state: "open",
    webUrl: "https://github.com/acme/widgets/pull/1",
  };
  currentChangeRequest.mockResolvedValue({
    changeRequest,
    checks: null,
  });
  resolveLink.mockResolvedValue(changeRequest);
  startShepherd.mockResolvedValue({
    id: "s1",
    chatId: "chat-1",
    state: "watching",
  });
});
afterEach(cleanup);
afterAll(() => {
  if (originalResizeObserver !== undefined) {
    Object.defineProperty(globalThis, "ResizeObserver", originalResizeObserver);
  } else {
    Reflect.deleteProperty(globalThis, "ResizeObserver");
  }
  if (originalDesktopEnvironment !== undefined) {
    Object.defineProperty(
      window,
      "desktopEnvironment",
      originalDesktopEnvironment,
    );
  } else {
    Reflect.deleteProperty(window, "desktopEnvironment");
  }
  if (originalScrollIntoView !== undefined) {
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

describe("WorkspaceCommandPalette", () => {
  it("opens via palette.open and jumps to a fuzzy title match", async () => {
    const onOpenSession = vi.fn();
    render(
      <WorkspaceCommandPalette
        chats={[chat]}
        onImportSession={null}
        onNewWorkspace={vi.fn()}
        onOpenSession={onOpenSession}
        onOpenSettings={vi.fn()}
      />,
    );

    await openPaletteViaCommand();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "comand palete" },
    });
    fireEvent.click(screen.getByText("Build command palette"));

    expect(onOpenSession).toHaveBeenCalledWith(chat);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("registers new workspace and settings actions", async () => {
    const onNewWorkspace = vi.fn();
    render(
      <WorkspaceCommandPalette
        chats={[]}
        onImportSession={null}
        onNewWorkspace={onNewWorkspace}
        onOpenSession={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    await openPaletteViaCommand();
    fireEvent.click(screen.getByText("ui.commandNewWorkspace"));

    expect(onNewWorkspace).toHaveBeenCalledTimes(1);
  });

  it("Shepherd PR starts against the current workspace context", async () => {
    render(
      <WorkspaceCommandPalette
        chats={[]}
        onImportSession={null}
        onNewWorkspace={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    await openPaletteViaCommand();
    await act(async () => {
      fireEvent.click(screen.getByText("ui.commandShepherdPr"));
    });

    await waitFor(() => {
      expect(startShepherd).toHaveBeenCalledWith({
        chatId: "chat-1",
        owner: "acme",
        prNumber: 1,
        repo: "widgets",
      });
    });
    expect(currentChangeRequest).toHaveBeenCalledWith("/tmp/repo-1");
    expect(resolveLink).toHaveBeenCalledWith(
      "/tmp/repo-1",
      "https://github.com/acme/widgets/pull/1",
    );
    expect(updateWorkspaceToolSnapshot).toHaveBeenCalled();
  });

  it("uses the latest tool context after switching chat/workspace", async () => {
    const view = render(
      <WorkspaceCommandPalette
        chats={[]}
        onImportSession={null}
        onNewWorkspace={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    await openPaletteViaCommand();
    await act(async () => {
      fireEvent.click(screen.getByText("ui.commandShepherdPr"));
    });
    await waitFor(() => {
      expect(startShepherd).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: "chat-1" }),
      );
    });

    // Switch workspace context without changing chats/t (the stale-closure bug).
    toolContext.chatId = "chat-2";
    toolContext.contextKey = "ctx-2";
    toolContext.projectId = "project-2";
    toolContext.root = "/tmp/repo-2";
    activation.projectPath = "/tmp/repo-2";
    const nextChangeRequest = {
      id: "9",
      number: 9,
      repository: { name: "other", namespace: ["acme"] },
      source: { name: "feature" },
      state: "open",
      webUrl: "https://gitlab.example.com/acme/other/-/merge_requests/9",
    };
    currentChangeRequest.mockResolvedValue({
      changeRequest: nextChangeRequest,
      checks: null,
    });
    resolveLink.mockResolvedValue(nextChangeRequest);
    startShepherd.mockClear();
    currentChangeRequest.mockClear();

    // Force a re-render so useCallback picks up new toolContext deps.
    view.rerender(
      <WorkspaceCommandPalette
        chats={[]}
        onImportSession={null}
        onNewWorkspace={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    await openPaletteViaCommand();
    await act(async () => {
      fireEvent.click(screen.getByText("ui.commandShepherdPr"));
    });

    await waitFor(() => {
      expect(startShepherd).toHaveBeenCalledWith({
        chatId: "chat-2",
        owner: "acme",
        prNumber: 9,
        repo: "other",
      });
    });
    expect(currentChangeRequest).toHaveBeenCalledWith("/tmp/repo-2");
  });

  it("makes zero source-control business requests when activation is not active", async () => {
    activation.status = "unresolved";
    activation.projectPath = "";
    render(
      <WorkspaceCommandPalette
        chats={[]}
        onImportSession={vi.fn()}
        onNewWorkspace={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    await openPaletteViaCommand();
    await act(async () => {
      fireEvent.click(screen.getByText("ui.commandShepherdPr"));
    });

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(currentChangeRequest).not.toHaveBeenCalled();
    expect(resolveLink).not.toHaveBeenCalled();
    expect(startShepherd).not.toHaveBeenCalled();
  });
});
