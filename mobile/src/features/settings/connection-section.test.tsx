import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  token: "paired-token" as string | null,
  health: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    baseUrl: "http://192.168.1.10:8787",
    isAuthenticated: mocks.token !== null,
    requiresAuth: true,
    signIn: vi.fn(),
    signOut: mocks.signOut,
    token: mocks.token,
  }),
}));

vi.mock("@/platform/daemon-provider", () => ({
  useDaemonClient: () => ({
    health: mocks.health,
  }),
}));

import { ConnectionSection } from "./connection-section";

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const clear = vi.spyOn(queryClient, "clear");
  const cancelQueries = vi.spyOn(queryClient, "cancelQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <ConnectionSection />
    </QueryClientProvider>,
  );
  return { cancelQueries, clear, queryClient };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  mocks.token = "paired-token";
  mocks.signOut.mockReset();
  mocks.health.mockResolvedValue({ version: "1.2.3" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("connectionSection", () => {
  it("shows paired server origin, connection state, and daemon version", async () => {
    renderSection();

    expect(screen.getByText("Paired server")).toBeDefined();
    expect(screen.getByText("http://192.168.1.10:8787")).toBeDefined();
    expect(await screen.findByText("Connected")).toBeDefined();
    expect(screen.getByText("1.2.3")).toBeDefined();
  });

  it("confirms disconnect, clears local auth, and cancels queries", async () => {
    const { cancelQueries, clear } = renderSection();

    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect this device" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Disconnect this device?" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "You'll need the pairing password to connect again. Chats and the desktop password are unchanged.",
      ),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    });
    expect(cancelQueries).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
  });

  it("hides disconnect when this device has no local token", () => {
    mocks.token = null;
    renderSection();
    expect(
      screen.queryByRole("button", { name: "Disconnect this device" }),
    ).toBeNull();
  });
});
