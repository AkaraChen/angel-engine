import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AboutSection } from "@/features/settings/about-section";
import i18n from "@/i18n";

const healthMock = vi.hoisted(() => ({
  data: undefined as { version?: string } | undefined,
}));
vi.mock("@/platform/use-daemon-health", () => ({
  useDaemonHealth: () => healthMock,
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AboutSection />
    </QueryClientProvider>,
  );
}

function stubClipboard(
  clipboard: { writeText: (text: string) => Promise<void> } | undefined,
) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
}

beforeEach(async () => {
  healthMock.data = { version: "1.2.3" };
  await i18n.changeLanguage("en");
});

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  vi.restoreAllMocks();
});

describe("AboutSection diagnostics copy", () => {
  it("confirms a successful copy", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValue();
    stubClipboard({ writeText });

    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));

    await screen.findByText("Copied");
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0]?.[0];
    expect(copied).toContain("app=");
    expect(copied).toContain("daemon=1.2.3");
    // Secret-free by contract: no token material ever leaves in diagnostics.
    expect(copied).not.toMatch(/token|password|secret/i);
  });

  it("shows a safe visible failure when the Clipboard API is unavailable", async () => {
    stubClipboard(undefined);

    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't copy. Copy the details by hand instead.",
    );
  });

  it("shows a safe visible failure when the Clipboard API rejects", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    stubClipboard({ writeText });

    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't copy. Copy the details by hand instead.",
    );
  });
});
