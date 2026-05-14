import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  normalizeSupportedLanguage,
  resources,
  supportedLanguages,
  type SupportedLanguage,
} from "@/i18n/resources";
import { ipc } from "@/platform/ipc";

const LANGUAGE_STORAGE_KEY = "angel-engine.language";

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
  syncMainLanguage(supportedLanguage);
});

syncMainLanguage(normalizeSupportedLanguage(i18n.resolvedLanguage));

function detectInitialLanguage(): SupportedLanguage {
  const persistedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (persistedLanguage) {
    return normalizeSupportedLanguage(persistedLanguage);
  }

  return normalizeSupportedLanguage(window.navigator.language);
}

function applyDocumentLanguage(language: SupportedLanguage): void {
  document.documentElement.lang = language;
  document.documentElement.dir = "ltr";
}

function syncMainLanguage(language: SupportedLanguage): void {
  void ipc.appSetLanguage(language).catch(() => undefined);
}

export { normalizeSupportedLanguage };
export type { SupportedLanguage };
export default i18n;
