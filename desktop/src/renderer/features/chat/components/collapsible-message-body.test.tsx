// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  CollapsibleMessageBody,
  collapsedMessageBodyMaxHeight,
} from "./collapsible-message-body";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeAll(() => {
  if (typeof window.ResizeObserver !== "function") {
    window.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
});

// jsdom reports every element as zero-height, so drive the overflow check with
// a stubbed scroll height.
function stubScrollHeight(height: number) {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollHeight",
  );
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => height,
  });
  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", original);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
    }
  };
}

afterEach(cleanup);

describe("CollapsibleMessageBody", () => {
  it("renders short content without a toggle", () => {
    const restore = stubScrollHeight(collapsedMessageBodyMaxHeight - 1);
    try {
      render(<CollapsibleMessageBody>short</CollapsibleMessageBody>);
      expect(screen.queryByRole("button")).toBeNull();
    } finally {
      restore();
    }
  });

  it("collapses tall content and expands it on click", () => {
    const restore = stubScrollHeight(collapsedMessageBodyMaxHeight + 1);
    try {
      render(<CollapsibleMessageBody>tall</CollapsibleMessageBody>);
      const toggle = screen.getByRole("button");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.textContent).toContain("common.showMore");

      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(toggle.textContent).toContain("common.showLess");
    } finally {
      restore();
    }
  });
});
