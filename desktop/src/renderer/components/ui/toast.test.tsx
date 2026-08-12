// @vitest-environment jsdom

import type { FC } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

Object.defineProperty(window, "desktopWindow", {
  configurable: true,
  value: {
    onUpdateDownloaded: () => () => {},
  },
});

import { ToastProvider, useToast } from "./toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ToastUpdateHarness: FC = () => {
  const toast = useToast();
  const toastHandle = useRef<ReturnType<typeof toast>>(undefined);

  return (
    <>
      <button
        onClick={() => {
          toastHandle.current = toast({
            duration: Number.POSITIVE_INFINITY,
            title: "Deleting worktree…",
            variant: "loading",
          });
        }}
        type="button"
      >
        Start
      </button>
      <button
        onClick={() => {
          toastHandle.current?.update({
            duration: 2_000,
            title: "Worktree deleted",
            variant: "success",
          });
        }}
        type="button"
      >
        Complete
      </button>
      <button
        onClick={() => {
          toastHandle.current?.update({
            duration: Number.POSITIVE_INFINITY,
            title: "Deleting worktree again…",
            variant: "loading",
          });
        }}
        type="button"
      >
        Restart
      </button>
    </>
  );
};

describe("ToastProvider", () => {
  it("updates an existing toast in place", () => {
    render(
      <ToastProvider>
        <ToastUpdateHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Deleting worktree…")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(screen.queryByText("Deleting worktree…")).toBeNull();
    expect(screen.getByText("Worktree deleted")).toBeDefined();
  });

  it("restarts the finite duration across viewport pause and resume", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastUpdateHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    const viewport = screen.getByRole("region", {
      name: "Notifications (F8)",
    });
    const viewportWrapper = viewport.parentElement;
    if (!viewportWrapper) throw new Error("Toast viewport wrapper is missing.");
    fireEvent.pointerMove(viewportWrapper);
    fireEvent.pointerLeave(viewportWrapper);

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.queryByText("Worktree deleted")).toBeNull();
  });

  it("keeps a toast open when an update changes its duration to infinity", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastUpdateHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    const viewport = screen.getByRole("region", {
      name: "Notifications (F8)",
    });
    const viewportWrapper = viewport.parentElement;
    if (!viewportWrapper) throw new Error("Toast viewport wrapper is missing.");
    fireEvent.pointerMove(viewportWrapper);
    fireEvent.pointerLeave(viewportWrapper);

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Deleting worktree again…")).toBeDefined();
  });
});
