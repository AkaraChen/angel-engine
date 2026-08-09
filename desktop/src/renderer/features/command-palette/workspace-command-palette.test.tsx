// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { WorkspaceCommandPalette } from "./workspace-command-palette";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

beforeEach(() => {
  window.desktopEnvironment.platform = "win32";
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
  it("opens with Ctrl+K and jumps to a fuzzy title match", () => {
    const onOpenSession = vi.fn();
    render(
      <WorkspaceCommandPalette
        chats={[chat]}
        onNewWorkspace={vi.fn()}
        onOpenSession={onOpenSession}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: "k" });
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "comand palete" },
    });
    fireEvent.click(screen.getByText("Build command palette"));

    expect(onOpenSession).toHaveBeenCalledWith(chat);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("registers new workspace and settings actions", () => {
    const onNewWorkspace = vi.fn();
    render(
      <WorkspaceCommandPalette
        chats={[]}
        onNewWorkspace={onNewWorkspace}
        onOpenSession={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    window.desktopEnvironment.platform = "darwin";
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(screen.getByText("ui.commandNewWorkspace"));

    expect(onNewWorkspace).toHaveBeenCalledTimes(1);
  });
});
