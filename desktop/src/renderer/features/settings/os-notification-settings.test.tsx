// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OsNotificationSettings } from "@/features/settings/settings-page";

vi.mock("react-i18next", () => ({
  initReactI18next: { init: () => {}, type: "3rdParty" },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/platform/ipc", () => ({
  ipc: new Proxy(
    {},
    {
      get: () => () => Promise.resolve(undefined),
    },
  ),
}));

vi.mock("@/platform/api-client", () => ({
  apiClient: {},
  getApiClient: () => ({}),
}));

const getPreferences = vi.fn();
const setPreferences = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.desktopWindow = {
    getNotificationPreferences: getPreferences,
    setNotificationPreferences: setPreferences,
  } as never;
});

afterEach(() => {
  cleanup();
});

const stored = {
  needsInput: false,
  osEnabled: true,
  runCompleted: false,
  sound: true,
};

describe("OsNotificationSettings", () => {
  it("keeps mutations disabled until the authoritative value loads", async () => {
    let release!: (value: typeof stored) => void;
    getPreferences.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    render(<OsNotificationSettings />);
    const master = screen.getByRole("switch", {
      name: "settings.workspace.osNotificationsSwitchLabel",
    }) as HTMLButtonElement;
    // While loading, the writable defaults must not be toggleable.
    expect(master.disabled).toBe(true);
    fireEvent.click(master);
    expect(setPreferences).not.toHaveBeenCalled();

    release(stored);
    await waitFor(() => expect(master.disabled).toBe(false));
    // Stored sibling choices win over the defaults.
    const needsInput = screen.getByRole("switch", {
      name: "settings.workspace.osNotificationsNeedsInputLabel",
    });
    expect(needsInput.getAttribute("aria-checked")).toBe("false");
    const runCompleted = screen.getByRole("switch", {
      name: "settings.workspace.osNotificationsRunCompletedLabel",
    });
    expect(runCompleted.getAttribute("aria-checked")).toBe("false");
  });

  it("offers retry when the initial load fails", async () => {
    getPreferences
      .mockRejectedValueOnce(new Error("ipc down"))
      .mockResolvedValueOnce(stored);

    render(<OsNotificationSettings />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("osNotificationsLoadFailed"),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings.workspace.osNotificationsRetry",
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("switch", {
            name: "settings.workspace.osNotificationsSwitchLabel",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(getPreferences).toHaveBeenCalledTimes(2);
  });

  it("shows a persistent failure on save error and quiet success on save", async () => {
    getPreferences.mockResolvedValue(stored);
    setPreferences
      .mockRejectedValueOnce(new Error("ENOSPC"))
      .mockResolvedValueOnce({ ...stored, sound: false });

    render(<OsNotificationSettings />);
    const sound = (await screen.findByRole("switch", {
      name: "settings.workspace.osNotificationsSoundLabel",
    })) as HTMLButtonElement;
    await waitFor(() => expect(sound.disabled).toBe(false));

    fireEvent.click(sound);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "settings.workspace.osNotificationsSaveFailed",
    );

    fireEvent.click(sound);
    await screen.findByRole("status");
    expect(setPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ sound: false }),
    );
  });
});
