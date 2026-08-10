// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetMobilePasswordDialog } from "@/features/settings/reset-mobile-password-dialog";

const translations: Record<string, string> = {
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saving": "Saving",
  "settings.mobile.passwordDialogDescription": "Enter a pairing password.",
  "settings.mobile.passwordDialogTitle": "Set pairing password",
  "settings.mobile.passwordRequired": "Enter a password.",
  "settings.mobile.passwordTitle": "Pairing password",
  "settings.mobile.saveFailed": "Couldn't save that setting. Try again.",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key }),
}));

function renderDialog(onSave: (password: string) => Promise<void>) {
  return render(
    <ResetMobilePasswordDialog
      isSaving={false}
      onOpenChange={() => {}}
      onSave={onSave}
      open
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ResetMobilePasswordDialog", () => {
  it("names the required field on submit attempt and focuses it", async () => {
    const onSave = vi.fn<(password: string) => Promise<void>>();
    renderDialog(onSave);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Enter a password.",
    );
    const input = screen.getByLabelText("Pairing password");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(
      "mobile-password-error",
    );
    expect(document.activeElement).toBe(input);
    expect(onSave).not.toHaveBeenCalled();

    // Correction clears the error and submits.
    fireEvent.change(input, { target: { value: "s3cret" } });
    expect(screen.queryByText("Enter a password.")).toBeNull();
  });

  it("keeps the precise failure near the action and allows retry", async () => {
    const onSave = vi
      .fn<(password: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("daemon offline"))
      .mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    render(
      <ResetMobilePasswordDialog
        isSaving={false}
        onOpenChange={onOpenChange}
        onSave={onSave}
        open
      />,
    );

    fireEvent.change(screen.getByLabelText("Pairing password"), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "daemon offline",
    );
    // The dialog stays open and the entered password is preserved.
    expect(
      (screen.getByLabelText("Pairing password") as HTMLInputElement).value,
    ).toBe("s3cret");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("closes after a successful save without exposing the secret", async () => {
    const onSave = vi
      .fn<(password: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <ResetMobilePasswordDialog
        isSaving={false}
        onOpenChange={onOpenChange}
        onSave={onSave}
        open
      />,
    );

    fireEvent.change(screen.getByLabelText("Pairing password"), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("s3cret"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText("s3cret")).toBeNull();
  });
});
