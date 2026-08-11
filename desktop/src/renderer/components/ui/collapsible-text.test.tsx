// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  CollapsibleText,
  defaultCollapsedTextMaxHeight,
} from "./collapsible-text";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

let scrollHeight = 0;

const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
  configurable: true,
  get: () => scrollHeight,
});

const resizeCallbacks: ResizeObserverCallback[] = [];
const originalResizeObserver = window.ResizeObserver;

class CapturingResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

window.ResizeObserver =
  CapturingResizeObserver as unknown as typeof ResizeObserver;

function notifyResize() {
  act(() => {
    for (const callback of resizeCallbacks) {
      callback([], {} as ResizeObserver);
    }
  });
}

function collapsedAttribute(root: ParentNode) {
  return (
    root.querySelector("[data-collapsed]")?.getAttribute("data-collapsed") ??
    null
  );
}

afterEach(() => {
  cleanup();
  resizeCallbacks.length = 0;
  scrollHeight = 0;
});

afterAll(() => {
  window.ResizeObserver = originalResizeObserver;
  if (originalScrollHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollHeight",
      originalScrollHeight,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  }
});

describe("CollapsibleText", () => {
  it("hides the load-more control when content fits", () => {
    scrollHeight = defaultCollapsedTextMaxHeight - 1;
    render(<CollapsibleText>short</CollapsibleText>);
    expect(screen.queryByTestId("collapsible-text-toggle")).toBeNull();
  });

  it("shows load more only when content overflows", () => {
    scrollHeight = defaultCollapsedTextMaxHeight + 1;
    render(<CollapsibleText>tall</CollapsibleText>);
    const toggle = screen.getByTestId("collapsible-text-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("common.loadMore");
    expect(collapsedAttribute(document.body)).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("common.showLess");
    expect(collapsedAttribute(document.body)).toBe("false");
  });

  it("re-measures after async content growth", () => {
    scrollHeight = defaultCollapsedTextMaxHeight - 1;
    render(<CollapsibleText>grows</CollapsibleText>);
    expect(screen.queryByTestId("collapsible-text-toggle")).toBeNull();

    scrollHeight = defaultCollapsedTextMaxHeight + 40;
    notifyResize();

    expect(screen.getByTestId("collapsible-text-toggle")).toBeDefined();
    expect(collapsedAttribute(document.body)).toBe("true");
  });

  it("resets to collapsed when resetKey changes", () => {
    scrollHeight = defaultCollapsedTextMaxHeight + 1;
    const { rerender } = render(
      <CollapsibleText resetKey="pr-1">tall</CollapsibleText>,
    );
    fireEvent.click(screen.getByTestId("collapsible-text-toggle"));
    expect(
      screen
        .getByTestId("collapsible-text-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("true");

    rerender(<CollapsibleText resetKey="pr-2">tall</CollapsibleText>);
    expect(
      screen
        .getByTestId("collapsible-text-toggle")
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
