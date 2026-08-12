// @vitest-environment jsdom

import type { FC } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

afterEach(cleanup);

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
});
