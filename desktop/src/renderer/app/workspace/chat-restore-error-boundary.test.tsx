// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatRestoreErrorBoundary } from "./chat-restore-error-boundary";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}));

function Boom(): never {
  throw new Error("hydrate failed");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatRestoreErrorBoundary", () => {
  it("offers retry and back without clearing history on failure", async () => {
    const onBack = vi.fn();
    const onRetry = vi.fn(() => Promise.resolve());
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <ChatRestoreErrorBoundary onBack={onBack} onRetry={onRetry}>
        <Boom />
      </ChatRestoreErrorBoundary>,
    );

    expect(await screen.findByText("thread.restoreFailedTitle")).toBeDefined();
    expect(screen.getByText("thread.restoreFailedDescription")).toBeDefined();
    expect(screen.getByTestId("chat-restore-retry")).toBeDefined();
    expect(screen.getByTestId("chat-restore-back")).toBeDefined();

    fireEvent.click(screen.getByTestId("chat-restore-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("chat-restore-retry"));
    await vi.waitFor(() => {
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    consoleError.mockRestore();
  });
});
