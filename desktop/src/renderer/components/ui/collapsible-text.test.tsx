// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CollapsibleText,
  defaultCollapsedTextMaxHeight,
} from "./collapsible-text";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

beforeAll(() => {
  window.ResizeObserver =
    CapturingResizeObserver as unknown as typeof ResizeObserver;
});

function notifyResize() {
  act(() => {
    for (const callback of resizeCallbacks) {
      callback([], {} as ResizeObserver);
    }
  });
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
  it("only renders the toggle when the content overflows", () => {
    scrollHeight = defaultCollapsedTextMaxHeight - 1;
    render(
      <CollapsibleText
        collapsedMaxHeight={defaultCollapsedTextMaxHeight}
        text="Short body"
      />,
    );
    expect(screen.queryByTestId("collapsible-text-toggle")).toBeNull();
  });

  it("toggles between load more and show less when overflowing", () => {
    scrollHeight = defaultCollapsedTextMaxHeight + 40;
    render(
      <CollapsibleText
        collapsedMaxHeight={defaultCollapsedTextMaxHeight}
        text="A much longer body"
      />,
    );
    const toggle = screen.getByTestId("collapsible-text-toggle");
    expect(toggle.textContent).toBe("common.loadMore");
    expect(
      screen
        .getByTestId("collapsible-text-content")
        .getAttribute("data-collapsed"),
    ).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("common.showLess");
    expect(
      screen
        .getByTestId("collapsible-text-content")
        .getAttribute("data-collapsed"),
    ).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("common.loadMore");
  });

  it("resets to collapsed when resetKey changes", () => {
    scrollHeight = defaultCollapsedTextMaxHeight + 40;
    const { rerender } = render(
      <CollapsibleText resetKey="pr-1" text="tall body" />,
    );
    fireEvent.click(screen.getByTestId("collapsible-text-toggle"));
    expect(screen.getByTestId("collapsible-text-toggle").textContent).toBe(
      "common.showLess",
    );

    rerender(<CollapsibleText resetKey="pr-2" text="tall body" />);
    expect(screen.getByTestId("collapsible-text-toggle").textContent).toBe(
      "common.loadMore",
    );
  });

  it("re-measures after ResizeObserver reports async content growth", () => {
    scrollHeight = defaultCollapsedTextMaxHeight - 1;
    render(<CollapsibleText text="grows later" />);
    expect(screen.queryByTestId("collapsible-text-toggle")).toBeNull();

    scrollHeight = defaultCollapsedTextMaxHeight + 80;
    notifyResize();

    expect(screen.getByTestId("collapsible-text-toggle")).toBeDefined();
    expect(
      screen
        .getByTestId("collapsible-text-content")
        .getAttribute("data-collapsed"),
    ).toBe("true");
  });

  it("scrolls the block to the start when collapsing", () => {
    scrollHeight = defaultCollapsedTextMaxHeight + 40;
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as typeof window.requestAnimationFrame;

    try {
      render(<CollapsibleText text="tall body" />);
      const toggle = screen.getByTestId("collapsible-text-toggle");
      fireEvent.click(toggle);
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.click(toggle);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      window.requestAnimationFrame = originalRaf;
    }
  });
});
