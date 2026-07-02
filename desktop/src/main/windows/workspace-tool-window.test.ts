import { describe, expect, it, vi } from "vitest";

import {
  trimWorkspaceToolSnapshots,
  WORKSPACE_TOOL_SNAPSHOT_LIMIT,
} from "./workspace-tool-window";

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { height: 800, width: 1200, x: 0, y: 0 },
    }),
  },
}));

vi.mock("electron-log/main", () => ({
  default: { warn: vi.fn() },
}));

vi.mock("./factory", () => ({
  createDesktopWindow: vi.fn(),
}));

describe("trimWorkspaceToolSnapshots", () => {
  it("keeps the map within the configured limit", () => {
    const snapshots = new Map<string, number>();
    for (let index = 0; index < WORKSPACE_TOOL_SNAPSHOT_LIMIT + 1; index += 1) {
      snapshots.set(`chat-${index}`, index);
    }

    trimWorkspaceToolSnapshots(snapshots);

    expect(snapshots.size).toBe(WORKSPACE_TOOL_SNAPSHOT_LIMIT);
    expect(snapshots.has("chat-0")).toBe(false);
    expect(snapshots.has(`chat-${WORKSPACE_TOOL_SNAPSHOT_LIMIT}`)).toBe(true);
  });
});
