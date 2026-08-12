import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppearanceSection } from "@/features/settings/appearance-section";
import { themeStorageKey } from "@/features/settings/theme";
import i18n from "@/i18n";

const LANGUAGE_STORAGE_KEY = "angel-engine-mobile.language";

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

function openLanguageSelect(name = "Language") {
  const trigger = screen.getByRole("combobox", { name });
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  return trigger;
}

async function selectLanguage(label: string) {
  openLanguageSelect();
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

beforeEach(async () => {
  // Start every case from English so a prior case's switch can't skew the
  // translated aria-label this test queries by.
  await i18n.changeLanguage("en");
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

afterEach(async () => {
  cleanup();
  // Reset the shared i18n singleton so language changes here don't leak into
  // other tests that assert English rendering.
  await i18n.changeLanguage("en");
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe("language switcher", () => {
  it("lists all eight supported languages", async () => {
    renderSection();
    openLanguageSelect();

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "English",
      "简体中文",
      "繁體中文",
      "Français",
      "Deutsch",
      "한국어",
      "日本語",
      "Español",
    ]);
  });

  it("switches language, persists it, and updates the document language", async () => {
    renderSection();
    await selectLanguage("日本語");

    await waitFor(() => {
      expect(i18n.language).toBe("ja");
    });
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    // The section re-renders in the newly selected language.
    expect(await screen.findByText("テーマ")).toBeDefined();
  });

  it("renders the label in the active language after switching", async () => {
    renderSection();
    await selectLanguage("Français");

    await waitFor(() => {
      expect(i18n.language).toBe("fr");
    });
    // aria-label comes from the "Langue" translation once French is active.
    expect(screen.getByRole("combobox", { name: "Langue" })).toBeDefined();
  });
});
