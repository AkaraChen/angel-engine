/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

vi.mock("@/features/settings/settings-store", () => ({
  useSettingsStore: (
    selector: (state: { sendWithModEnter: boolean }) => unknown,
  ) => selector({ sendWithModEnter: false }),
}));

vi.mock("@/platform/ipc", () => ({
  ipc: {
    keymapGetUserBindings: async () => ({
      file: { version: 1 as const, bindings: [] },
      warnings: [],
      path: "/tmp/keybindings.json",
    }),
    keymapSetUserBindings: async (file: {
      version: 1;
      bindings: unknown[];
    }) => ({
      file,
      warnings: [],
      path: "/tmp/keybindings.json",
    }),
    keymapResetAll: async () => ({
      file: { version: 1 as const, bindings: [] },
      warnings: [],
      path: "/tmp/keybindings.json",
    }),
  },
}));

Object.defineProperty(window, "desktopWindow", {
  configurable: true,
  value: {
    onKeymapUserBindingsChanged: () => () => {},
  },
});

Object.defineProperty(window, "desktopEnvironment", {
  configurable: true,
  value: { platform: "darwin", getPathForFile: () => null },
});

import { KeymapProvider, useContextKey, useKeymap } from "./provider";

function Publisher({ name, value }: { name: string; value: boolean }) {
  useContextKey("chat.running", value);
  return <span data-testid={`publisher-${name}`}>{String(value)}</span>;
}

function Reader() {
  const value = useKeymap().contextKeys["chat.running"];
  return <span data-testid="reader">{String(value)}</span>;
}

function Harness({
  showFirst,
  showSecond,
}: {
  showFirst: boolean;
  showSecond: boolean;
}) {
  return (
    <KeymapProvider>
      {showFirst ? <Publisher name="first" value={true} /> : null}
      {showSecond ? <Publisher name="second" value={false} /> : null}
      <Reader />
    </KeymapProvider>
  );
}

afterEach(cleanup);

describe("useContextKey ownership", () => {
  it("does not clear a key when an older owner unmounts after a newer one published", async () => {
    const { rerender } = render(<Harness showFirst showSecond={false} />);
    // Allow provider effects to settle
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("true");

    rerender(<Harness showFirst showSecond />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("false");

    // Unmount first publisher only — second remains owner
    rerender(<Harness showFirst={false} showSecond />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("false");
  });
});
