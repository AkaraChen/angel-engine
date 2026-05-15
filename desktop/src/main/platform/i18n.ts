import type { SupportedLanguage } from "../../shared/i18n/resources";

import i18n from "i18next";
import {
  normalizeSupportedLanguage,
  resources,
  supportedLanguages,
} from "../../shared/i18n/resources";

void i18n.init({
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  lng: "en",
  resources,
  supportedLngs: [...supportedLanguages],
});

export function setMainLanguage(language: string): SupportedLanguage {
  const supportedLanguage = normalizeSupportedLanguage(language);
  void i18n.changeLanguage(supportedLanguage);
  return supportedLanguage;
}

export function translate(
  key: string,
  options?: Record<string, unknown>,
): string {
  return i18n.t(key, options);
}
