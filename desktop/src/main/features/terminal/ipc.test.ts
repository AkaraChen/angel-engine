import { describe, expect, it, vi } from "vitest";

import {
  parseTerminalCreateRequest,
  parseTerminalResizeInput,
  parseTerminalWriteInput,
} from "./ipc";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock("electron-log/main", () => ({
  default: { warn: vi.fn() },
}));

vi.mock("node-pty", () => ({
  spawn: vi.fn(),
}));

describe("terminal IPC input parsing", () => {
  it("trims strings and floors dimensions", () => {
    expect(
      parseTerminalCreateRequest({
        cols: 80.9,
        cwd: " /tmp ",
        rows: 0.9,
        sessionId: " session ",
      }),
    ).toEqual({
      cols: 80,
      cwd: "/tmp",
      rows: 1,
      sessionId: "session",
    });
  });

  it("allows empty write data", () => {
    expect(
      parseTerminalWriteInput({ data: "", sessionId: " session " }),
    ).toEqual({
      data: "",
      sessionId: "session",
    });
  });

  it("rejects malformed terminal input", () => {
    expect(() => parseTerminalResizeInput(null)).toThrow();
    expect(() =>
      parseTerminalResizeInput({ cols: Infinity, rows: 24, sessionId: "s" }),
    ).toThrow();
    expect(() =>
      parseTerminalResizeInput({ cols: 80, rows: 24, sessionId: " " }),
    ).toThrow();
  });
});
