import type { MenuItemConstructorOptions } from "electron";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mainWindow = {
    focus: vi.fn(),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    webContents: { send: vi.fn() },
  };

  return {
    appFocus: vi.fn(),
    auxiliarySend: vi.fn(),
    buildFromTemplate: vi.fn(
      (template: MenuItemConstructorOptions[]) => template,
    ),
    ensureMainWindow: vi.fn(() => mainWindow),
    mainWindow,
    setApplicationMenu: vi.fn(),
  };
});

vi.mock("electron", () => ({
  app: { focus: mocks.appFocus, name: "Angel Engine" },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: mocks.auxiliarySend } }],
    getFocusedWindow: () => ({ webContents: { send: mocks.auxiliarySend } }),
  },
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
    setApplicationMenu: mocks.setApplicationMenu,
  },
}));

vi.mock("../updater", () => ({
  checkForUpdatesFromMenu: vi.fn(),
}));

vi.mock("../windows/main-window", () => ({
  ensureMainWindow: mocks.ensureMainWindow,
}));

vi.mock("./i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("./keybindings-store", () => ({
  getKeybindingsState: () => ({
    file: { bindings: [], version: 1 },
    path: "/tmp/keybindings.json",
    warnings: [],
  }),
}));

const { configureApplicationMenu } = await import("./application-menu");

function clickMenuItem(label: string) {
  const template = mocks.buildFromTemplate.mock.calls.at(-1)?.[0];
  const item = findMenuItem(template, label);
  expect(item?.click).toBeTypeOf("function");
  (item?.click as (() => void) | undefined)?.();
}

function findMenuItem(
  items: MenuItemConstructorOptions[] | undefined,
  label: string,
): MenuItemConstructorOptions | undefined {
  for (const item of items ?? []) {
    if (item.label === label) return item;
    if (Array.isArray(item.submenu)) {
      const nested = findMenuItem(item.submenu, label);
      if (nested) return nested;
    }
  }
  return undefined;
}

describe("application menu commands", () => {
  beforeEach(() => {
    mocks.appFocus.mockClear();
    mocks.auxiliarySend.mockClear();
    mocks.ensureMainWindow.mockClear();
    mocks.mainWindow.focus.mockClear();
    mocks.mainWindow.webContents.send.mockClear();
    configureApplicationMenu({ openSettingsWindow: vi.fn() });
  });

  it("routes new chat to main when an auxiliary window is focused", () => {
    clickMenuItem("workspace.newChat");

    expect(mocks.ensureMainWindow).toHaveBeenCalledOnce();
    expect(mocks.mainWindow.focus).toHaveBeenCalledOnce();
    expect(mocks.mainWindow.webContents.send).toHaveBeenCalledWith(
      "desktop-window:command",
      { command: "new-chat" },
    );
    expect(mocks.auxiliarySend).not.toHaveBeenCalled();
  });

  it("creates and targets main when only an auxiliary window remains", () => {
    clickMenuItem("sidebar.toggleSidebar");

    expect(mocks.ensureMainWindow).toHaveBeenCalledOnce();
    expect(mocks.mainWindow.webContents.send).toHaveBeenCalledWith(
      "desktop-window:command",
      { command: "toggle-sidebar" },
    );
    expect(mocks.auxiliarySend).not.toHaveBeenCalled();
  });
});
