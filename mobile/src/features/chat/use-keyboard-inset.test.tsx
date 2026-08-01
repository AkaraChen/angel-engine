import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "./use-keyboard-inset";

function Probe() {
  return <span data-testid="inset">{useKeyboardInset()}</span>;
}

/** Minimal stand-in for the parts of `visualViewport` the hook reads. */
function stubViewport(initial: { height: number; offsetTop: number }) {
  const listeners = new Set<() => void>();
  const viewport = {
    ...initial,
    addEventListener: (_: string, handler: () => void) =>
      void listeners.add(handler),
    removeEventListener: (_: string, handler: () => void) =>
      void listeners.delete(handler),
  };
  vi.stubGlobal("visualViewport", viewport);
  return {
    resize(next: { height: number; offsetTop: number }) {
      Object.assign(viewport, next);
      act(() => {
        for (const handler of listeners) handler();
      });
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useKeyboardInset", () => {
  it("reports the height the keyboard covers", () => {
    vi.stubGlobal("innerHeight", 812);
    const viewport = stubViewport({ height: 812, offsetTop: 0 });

    render(<Probe />);
    expect(screen.getByTestId("inset").textContent).toBe("0");

    // Keyboard opens: iOS shrinks the visual viewport but not `innerHeight`.
    viewport.resize({ height: 476, offsetTop: 0 });
    expect(screen.getByTestId("inset").textContent).toBe("336");
  });

  it("does not count a scrolled visual viewport as keyboard height", () => {
    vi.stubGlobal("innerHeight", 812);
    const viewport = stubViewport({ height: 476, offsetTop: 0 });

    render(<Probe />);
    // Scrolling the page under the keyboard moves the visual viewport down;
    // the keyboard still covers the same 336px.
    viewport.resize({ height: 476, offsetTop: 120 });
    expect(screen.getByTestId("inset").textContent).toBe("216");
  });

  it("stays at zero where visualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    render(<Probe />);
    expect(screen.getByTestId("inset").textContent).toBe("0");
  });
});
