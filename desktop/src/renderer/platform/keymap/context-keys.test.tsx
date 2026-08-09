/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

function Publisher({
  name,
  contextKey,
  value,
}: {
  name: string;
  contextKey: string;
  value: string | boolean;
}) {
  useContextKey(contextKey, value);
  return <span data-testid={`publisher-${name}`}>{String(value)}</span>;
}

function Reader({ contextKey }: { contextKey: string }) {
  const value = useKeymap().contextKeys[contextKey];
  return <span data-testid="reader">{String(value)}</span>;
}

function BoolHarness({
  showFirst,
  showSecond,
}: {
  showFirst: boolean;
  showSecond: boolean;
}) {
  return (
    <KeymapProvider>
      {showFirst ? (
        <Publisher name="first" contextKey="chat.running" value={true} />
      ) : null}
      {showSecond ? (
        <Publisher name="second" contextKey="chat.running" value={false} />
      ) : null}
      <Reader contextKey="chat.running" />
    </KeymapProvider>
  );
}

function StringHarness({
  showFirst,
  showSecond,
  firstValue,
  secondValue,
}: {
  showFirst: boolean;
  showSecond: boolean;
  firstValue: string;
  secondValue: string;
}) {
  return (
    <KeymapProvider>
      {showFirst ? (
        <Publisher name="first" contextKey="test.layer" value={firstValue} />
      ) : null}
      {showSecond ? (
        <Publisher name="second" contextKey="test.layer" value={secondValue} />
      ) : null}
      <Reader contextKey="test.layer" />
    </KeymapProvider>
  );
}

afterEach(cleanup);

describe("useContextKey ownership stack", () => {
  it("does not clear a key when an older owner unmounts after a newer one published", async () => {
    const { rerender } = render(<BoolHarness showFirst showSecond={false} />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("true");

    rerender(<BoolHarness showFirst showSecond />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("false");

    rerender(<BoolHarness showFirst={false} showSecond />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("false");
  });

  it("restores the previous owner value when the newer owner unmounts first", async () => {
    const { rerender } = render(<BoolHarness showFirst showSecond={false} />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("true");

    rerender(<BoolHarness showFirst showSecond />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("false");

    rerender(<BoolHarness showFirst showSecond={false} />);
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("true");
  });

  it("does not reorder the stack when a buried owner updates its value", async () => {
    // A(a1) → B(b) → A value→a2 still B → B unmount restores a2
    const { rerender } = render(
      <StringHarness
        showFirst
        showSecond={false}
        firstValue="a1"
        secondValue="b"
      />,
    );
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("a1");

    rerender(
      <StringHarness showFirst showSecond firstValue="a1" secondValue="b" />,
    );
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("b");

    // Buried A updates — must stay under B (reader still b, not a2).
    rerender(
      <StringHarness showFirst showSecond firstValue="a2" secondValue="b" />,
    );
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("b");

    // B unmounts — restore A's *new* value a2 (not stale a1).
    rerender(
      <StringHarness
        showFirst
        showSecond={false}
        firstValue="a2"
        secondValue="b"
      />,
    );
    await Promise.resolve();
    expect(screen.getByTestId("reader").textContent).toBe("a2");
  });
});
