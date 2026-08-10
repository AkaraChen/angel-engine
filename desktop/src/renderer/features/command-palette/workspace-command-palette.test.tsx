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
        onNewWorkspace={onNewWorkspace}
        onOpenSession={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    await openPaletteViaCommand();
    fireEvent.click(screen.getByText("ui.commandNewWorkspace"));

    expect(onNewWorkspace).toHaveBeenCalledTimes(1);
  });
});
