import type { SupportedLanguage } from "@/i18n/resources";
import i18n from "i18next";

import { initReactI18next } from "react-i18next";
import { useSettingsStore } from "@/features/settings/settings-store";
import {
  normalizeSupportedLanguage,
  resources,
  supportedLanguages,
} from "@/i18n/resources";
import { ipc } from "@/platform/ipc";

const LANGUAGE_STORAGE_KEY = "angel-engine.language";

type CjkFontLocale = "sc" | "tc" | "jp" | "kr";

export const languageOptions: Array<{
  labelKey: `settings.appearance.languageOptions.${SupportedLanguage}`;
  value: SupportedLanguage;
}> = supportedLanguages.map((language) => ({
  labelKey: `settings.appearance.languageOptions.${language}`,
  value: language,
}));

const initialLanguage = detectInitialLanguage();
const initialCjkFontLanguage = detectInitialCjkFontLanguage(initialLanguage);

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  lng: initialLanguage,
  react: {
    useSuspense: false,
  },
  resources,
  supportedLngs: [...supportedLanguages],
});

applyDocumentLanguage(
  normalizeSupportedLanguage(i18n.resolvedLanguage),
  initialCjkFontLanguage,
);

i18n.on("languageChanged", (language) => {
  const supportedLanguage = normalizeSupportedLanguage(language);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, supportedLanguage);
  applyDocumentLanguage(supportedLanguage, language);
  syncMainLanguage(supportedLanguage);
  if (useSettingsStore.getState().language !== supportedLanguage) {
    useSettingsStore.getState().setLanguage(supportedLanguage);
  }
});

useSettingsStore.subscribe((state, previousState) => {
  if (state.language === previousState.language) return;
  if (
    i18n.resolvedLanguage === state.language ||
    i18n.language === state.language
  ) {
    return;
  }

  void i18n.changeLanguage(state.language);
});

syncMainLanguage(normalizeSupportedLanguage(i18n.resolvedLanguage));

function detectInitialLanguage(): SupportedLanguage {
  const persistedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (persistedLanguage) {
    return normalizeSupportedLanguage(persistedLanguage);
  }

  return normalizeSupportedLanguage(window.navigator.language);
}

function detectInitialCjkFontLanguage(
  supportedLanguage: SupportedLanguage,
): string {
  const persistedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (persistedLanguage) {
    return persistedLanguage;
  }

  return (
    window.navigator.languages.find((language) =>
      languageUsesCjkFont(language),
    ) ??
    window.navigator.language ??
    supportedLanguage
  );
}

function applyDocumentLanguage(
  language: SupportedLanguage,
  cjkFontLanguage: string = language,
): void {
  document.documentElement.lang = language;
  document.documentElement.dir = "ltr";
  document.documentElement.dataset.cjkFont =
    cjkFontLocaleFromLanguage(cjkFontLanguage);
}

function syncMainLanguage(language: SupportedLanguage): void {
  void ipc.appSetLanguage(language).catch(() => undefined);
}

function languageUsesCjkFont(language: string): boolean {
  const normalized = language.toLowerCase();
  return (
    normalized.startsWith("zh") ||
    normalized.startsWith("ja") ||
    normalized.startsWith("ko")
  );
}

function cjkFontLocaleFromLanguage(language: string): CjkFontLocale {
  const normalized = language.toLowerCase();

  if (normalized.startsWith("ja")) {
    return "jp";
  }

  if (normalized.startsWith("ko")) {
    return "kr";
  }

  if (
    normalized.includes("hant") ||
    normalized.startsWith("zh-tw") ||
    normalized.startsWith("zh-hk") ||
    normalized.startsWith("zh-mo")
  ) {
    return "tc";
  }

  return "sc";
}

export { normalizeSupportedLanguage };
export type { SupportedLanguage };
export default i18n;
