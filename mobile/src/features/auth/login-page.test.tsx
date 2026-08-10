import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PairingError } from "@/features/auth/session";
import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    baseUrl: "",
    isAuthenticated: false,
    requiresAuth: true,
    signIn: mocks.signIn,
    signOut: vi.fn(),
    token: null,
  }),
}));

import { LoginPage } from "./login-page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

function passwordInput(): HTMLInputElement {
  return screen.getByLabelText("Password") as HTMLInputElement;
}

describe("loginPage", () => {
  it("keeps password manager autofill attributes and reveals without clearing", () => {
    render(<LoginPage />);

    const input = passwordInput();
    expect(input.getAttribute("autocomplete")).toBe("current-password");
    expect(input.type).toBe("password");

    fireEvent.change(input, { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(passwordInput().type).toBe("text");
    expect(passwordInput().value).toBe("secret-pass");
    expect(
      screen
        .getByRole("button", { name: "Hide password" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("associates invalid-password with the field, focuses, and keeps the value", async () => {
    mocks.signIn.mockRejectedValueOnce(
      new PairingError("invalid-password", 401),
    );
    render(<LoginPage />);

    const input = passwordInput();
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Incorrect password");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby") ?? "").toContain(alert.id);
    expect(input.value).toBe("wrong");
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    expect(screen.getByText(/Desktop Settings → Mobile view/)).toBeDefined();
  });

  it("shows a connection error for offline server failures", async () => {
    mocks.signIn.mockRejectedValueOnce(new PairingError("server-error", 0));
    render(<LoginPage />);

    fireEvent.change(passwordInput(), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't reach the desktop app");
  });

  it("prevents duplicate submits while pairing is busy", async () => {
    let resolveSignIn: ((value: void) => void) | undefined;
    mocks.signIn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    render(<LoginPage />);

    fireEvent.change(passwordInput(), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByRole("button", { name: "Connecting…" }),
    ).toBeDefined();
    expect(mocks.signIn).toHaveBeenCalledTimes(1);

    // Second click must not start another pairing attempt while busy.
    fireEvent.click(screen.getByRole("button", { name: "Connecting…" }));
    expect(mocks.signIn).toHaveBeenCalledTimes(1);

    // Settle the in-flight promise so vitest does not hang on open handles.
    resolveSignIn?.(undefined);
    await waitFor(() => {
      expect(resolveSignIn).toBeTypeOf("function");
    });
  });

  it("re-announces after the user edits and retries", async () => {
    mocks.signIn
      .mockRejectedValueOnce(new PairingError("invalid-password", 401))
      .mockRejectedValueOnce(new PairingError("invalid-password", 401));
    render(<LoginPage />);

    fireEvent.change(passwordInput(), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("alert")).toBeDefined();

    fireEvent.change(passwordInput(), { target: { value: "ab" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(mocks.signIn).toHaveBeenCalledTimes(2);
  });
});
