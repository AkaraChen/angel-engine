import { afterEach, describe, expect, it, vi } from "vitest";

describe("workspace UI persistence migration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("ignores the legacy persisted workspace mode", async () => {
    const values = new Map([["angel-engine.workspace-mode", "power"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
    const { useWorkspaceUiStore } = await import("./workspace-ui-store");
    expect("workspaceMode" in useWorkspaceUiStore.getState()).toBe(false);
    expect(values.get("angel-engine.workspace-mode")).toBe("power");
  });
});
