import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userData: "",
}));

vi.mock("electron", () => ({
  app: { getPath: () => mocks.userData },
  ipcMain: { handle: vi.fn() },
}));
vi.mock("electron-log/main", () => ({ default: { warn: vi.fn() } }));

import {
  readWorkspaceDiffBasePreference,
  writeWorkspaceDiffBasePreference,
} from "./workspace-diff-preferences";

beforeEach(() => {
  mocks.userData = mkdtempSync(path.join(os.tmpdir(), "workspace-diff-base-"));
});

afterEach(() => {
  rmSync(mocks.userData, { force: true, recursive: true });
});

describe("workspace diff base preferences", () => {
  it("remembers independent base selections per workspace root", () => {
    writeWorkspaceDiffBasePreference({ baseKind: "branch", root: "/repo/a" });
    writeWorkspaceDiffBasePreference({ baseKind: "turn", root: "/repo/b" });

    expect(readWorkspaceDiffBasePreference("/repo/a")).toEqual({
      baseKind: "branch",
    });
    expect(readWorkspaceDiffBasePreference("/repo/b")).toEqual({
      baseKind: "turn",
    });
  });

  it("falls back when the preference file is corrupt", () => {
    writeFileSync(
      path.join(mocks.userData, "workspace-diff-base.json"),
      "not-json",
    );

    expect(readWorkspaceDiffBasePreference("/repo/a")).toBeUndefined();
  });
});
