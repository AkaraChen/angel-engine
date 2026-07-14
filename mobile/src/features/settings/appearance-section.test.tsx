import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { afterEach, describe, expect, it } from "vitest";

import { AppearanceSection } from "@/features/settings/appearance-section";
import { themeStorageKey } from "@/features/settings/theme";

function renderSection() {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={themeStorageKey}
    >
      <AppearanceSection />
    </ThemeProvider>,
  );
}

function themeOption(label: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[aria-label="${label}"]`,
  );
  if (!element) throw new Error(`missing theme option: ${label}`);
  return element;
}

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

describe("appearanceSection", () => {
  it("offers the three theme modes", async () => {
    renderSection();
    await screen.findByText("Theme");
    expect(themeOption("System")).toBeDefined();
    expect(themeOption("Light")).toBeDefined();
    expect(themeOption("Dark")).toBeDefined();
  });

  it("applies the picked theme to the document", async () => {
    renderSection();
    await screen.findByText("Theme");

    fireEvent.click(themeOption("Dark"));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    fireEvent.click(themeOption("Light"));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("keeps the theme storage key namespaced to the mobile client", () => {
    // Guards KIT-144: mobile must not reuse the desktop's settings storage.
    expect(themeStorageKey).toMatch(/mobile/);
  });
});
