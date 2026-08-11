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
    t: (key: string, options?: Record<string, string>) => {
      if (options === undefined) return key;
      return `${key}:${Object.entries(options)
        .map(([name, value]) => `${name}=${value}`)
        .join(",")}`;
    },
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
    expect(
      message.closest("[class*='bg-muted/50']") ??
        message.closest("[class*='bg-muted']"),
    ).toBeTruthy();
    expect(screen.queryByText(/settings\.updates\.stateUpToDate/)).toBeNull();
  });

  it("shows success and the check time after a completed update check", () => {
    status = updateStatus({ lastCheckedAt: Date.UTC(2026, 7, 2, 8, 30) });

    render(<UpdateSettings />);

    expect(screen.getByText("settings.updates.stateUpToDate")).toBeDefined();
    const detail = screen.getByText(
      "settings.updates.stateIdleDetail:time=Aug 2, 2026, 4:30 PM",
    );
    expect(detail.closest("[class*='bg-status-success-soft']")).toBeTruthy();
  });

  it("renders determinate download progress with size and speed", () => {
    status = updateStatus({
      availableVersion: "1.2.0",
      progress: {
        bytesPerSecond: 1024 * 1024,
        percent: 42,
        total: 10_000_000,
        transferred: 4_200_000,
      },
      state: "downloading",
    });

    render(<UpdateSettings />);

    expect(
      screen.getByText("settings.updates.stateDownloading:version=1.2.0"),
    ).toBeDefined();
    expect(
      screen.getByText(
        "settings.updates.downloadProgressWithSpeed:percent=42,speed=1.0 MB/s,total=9.5 MB,transferred=4.0 MB",
      ),
    ).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "42",
    );
  });

  it("uses an indeterminate bar when total size is unknown", () => {
    status = updateStatus({
      availableVersion: "1.2.0",
      progress: {
        bytesPerSecond: 512,
        transferred: 8_000,
      },
      state: "downloading",
    });

    render(<UpdateSettings />);

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(
      screen.getByText(
        "settings.updates.downloadIndeterminateWithSpeed:speed=512 B/s,transferred=7.8 KB",
      ),
    ).toBeDefined();
  });

  it("keeps the error reason and a retry control", () => {
    status = updateStatus({
      errorMessage: "network down",
      state: "error",
    });

    render(<UpdateSettings />);

    expect(
      screen.getByText("settings.updates.stateError:detail=network down"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "common.retry" })).toBeDefined();
  });

  it("shows installing without inventing download progress", () => {
    status = updateStatus({
      availableVersion: "1.3.0",
      state: "installing",
    });

    render(<UpdateSettings />);

    expect(
      screen.getByText("settings.updates.stateInstalling:version=1.3.0"),
    ).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
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
