import type { SupportedLanguage } from "./resources";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  normalizeSupportedLanguage,
  resources,
  supportedLanguages,
} from "./resources";

/**
 * localStorage key for the mobile language preference. Namespaced to the mobile
 * client so it never collides with — or writes back to — the desktop renderer's
 * own settings storage (KIT-144: mobile settings must not affect desktop
 * configuration).
 */
const LANGUAGE_STORAGE_KEY = "angel-engine-mobile.language";

export const languageOptions: Array<{
  labelKey: `settings.appearance.languageOptions.${SupportedLanguage}`;
  value: SupportedLanguage;
}> = supportedLanguages.map((language) => ({
  labelKey: `settings.appearance.languageOptions.${language}`,
  value: language,
}));

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  lng: detectInitialLanguage(),
  react: {
    useSuspense: false,
  },
  resources,
  supportedLngs: [...supportedLanguages],
});

applyDocumentLanguage(normalizeSupportedLanguage(i18n.resolvedLanguage));

i18n.on("languageChanged", (language) => {
  const supportedLanguage = normalizeSupportedLanguage(language);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, supportedLanguage);
  applyDocumentLanguage(supportedLanguage);
});

function detectInitialLanguage(): SupportedLanguage {
  const persistedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (typeof persistedLanguage === "string" && persistedLanguage.length > 0) {
    return normalizeSupportedLanguage(persistedLanguage);
  }

  return normalizeSupportedLanguage(window.navigator.language);
}

function applyDocumentLanguage(language: SupportedLanguage): void {
  document.documentElement.lang = language;
  document.documentElement.dir = "ltr";
}

export type { SupportedLanguage };
export default i18n;
