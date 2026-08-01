// @vitest-environment jsdom

import type { DesktopUpdateStatus } from "@shared/update-channel";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpdateSettings } from "./update-settings";

let status: DesktopUpdateStatus;

vi.mock("@/features/settings/use-update-status", () => ({
  useUpdateStatus: () => ({
    checkForUpdates: vi.fn(),
    setChannel: vi.fn(),
    status,
  }),
}));

vi.mock("@/platform/format-time", () => ({
  formatDateTime: () => "Aug 2, 2026, 4:30 PM",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options?.time ? `${key}: ${options.time}` : key,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UpdateSettings", () => {
  it("shows a neutral message before the first update check", () => {
    status = updateStatus();

    render(<UpdateSettings />);

    const message = screen.getByText("settings.updates.stateUnchecked");
    expect(message.parentElement?.className).toContain("bg-muted/50");
    expect(screen.queryByText(/settings\.updates\.stateIdle/)).toBeNull();
  });

  it("shows success and the check time after a completed update check", () => {
    status = updateStatus({ lastCheckedAt: Date.UTC(2026, 7, 2, 8, 30) });

    render(<UpdateSettings />);

    const message = screen.getByText(
      "settings.updates.stateIdle: Aug 2, 2026, 4:30 PM",
    );
    expect(message.parentElement?.className).toContain(
      "bg-status-success-soft",
    );
  });
});

function updateStatus(
  overrides: Partial<DesktopUpdateStatus> = {},
): DesktopUpdateStatus {
  return {
    channel: "stable",
    currentVersion: "1.0.0",
    state: "idle",
    supported: true,
    ...overrides,
  };
}
