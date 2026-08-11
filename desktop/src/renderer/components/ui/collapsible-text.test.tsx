// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CollapsibleText } from "./collapsible-text";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  disconnect() {}
  observe(target: Element) {
    this.callback(
      [{ target } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CollapsibleText", () => {
  it("only renders the toggle when the content overflows", async () => {
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(80);
    const { rerender } = render(
      <CollapsibleText collapsedMaxHeight={100} text="Short body" />,
    );

    expect(screen.queryByRole("button")).toBeNull();

    scrollHeight.mockReturnValue(180);
    rerender(
      <CollapsibleText collapsedMaxHeight={100} text="A much longer body" />,
    );

    expect((await screen.findByRole("button")).textContent).toBe(
      "common.loadMore",
    );
  });
});
