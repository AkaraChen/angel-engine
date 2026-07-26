// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  CollapsibleMessageBody,
  collapsedMessageBodyMaxHeight,
} from "./collapsible-message-body";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// jsdom reports every element as zero-height, so drive the overflow check with
// a stubbed scroll height.
let scrollHeight = 0;

const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
  configurable: true,
  get: () => scrollHeight,
});

// Capture the observer callbacks so a test can replay a resize the way the
// browser would once content grows.
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

// Rendering outside act() is deliberate here: act would flush passive effects
// too and hide the difference this test exists to catch.
const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

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

describe("CollapsibleMessageBody", () => {
  it("renders short content without a toggle", () => {
    scrollHeight = collapsedMessageBodyMaxHeight - 1;
    render(<CollapsibleMessageBody>short</CollapsibleMessageBody>);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("collapses tall content and expands it on click", () => {
    scrollHeight = collapsedMessageBodyMaxHeight + 1;
    render(<CollapsibleMessageBody>tall</CollapsibleMessageBody>);
    const toggle = screen.getByRole("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("common.showMore");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("common.showLess");
  });

  // A synchronous mount flushes layout effects but not passive ones, so this
  // only holds while the measurement runs in a layout effect — i.e. the clamp
  // lands before the browser paints the full-height message.
  it("clamps tall content during the initial synchronous mount", () => {
    scrollHeight = collapsedMessageBodyMaxHeight + 1;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const wasActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;

    try {
      flushSync(() => {
        root.render(<CollapsibleMessageBody>tall</CollapsibleMessageBody>);
      });
      expect(collapsedAttribute(host)).toBe("true");
    } finally {
      flushSync(() => {
        root.unmount();
      });
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
      host.remove();
    }
  });

  it("collapses once a resize grows the content past the limit", () => {
    scrollHeight = collapsedMessageBodyMaxHeight - 1;
    const { container } = render(
      <CollapsibleMessageBody>grows</CollapsibleMessageBody>,
    );
    expect(screen.queryByRole("button")).toBeNull();

    scrollHeight = collapsedMessageBodyMaxHeight + 1;
    notifyResize();

    expect(screen.getByRole("button")).toBeDefined();
    expect(collapsedAttribute(container)).toBe("true");
  });
});
