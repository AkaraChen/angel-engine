import type { Locale } from "date-fns";
import type { SupportedLanguage } from "./resources";

// Deep-import only the eight locales we ship instead of the `date-fns/locale`
// barrel, which re-exports every locale as its own module and makes the test
// transform crawl.
import { de } from "date-fns/locale/de";
import { enUS } from "date-fns/locale/en-US";
import { es } from "date-fns/locale/es";
import { fr } from "date-fns/locale/fr";
import { ja } from "date-fns/locale/ja";
import { ko } from "date-fns/locale/ko";
import { zhCN } from "date-fns/locale/zh-CN";
import { zhTW } from "date-fns/locale/zh-TW";
import { useTranslation } from "react-i18next";

import { normalizeSupportedLanguage } from "./resources";

/**
 * date-fns locale for each supported language, so relative timestamps (e.g.
 * "2 hours ago") render in the active language instead of always English.
 */
const DATE_FNS_LOCALES: Record<SupportedLanguage, Locale> = {
  en: enUS,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  fr,
  de,
  ko,
  ja,
  es,
};

export function dateFnsLocale(language: SupportedLanguage): Locale {
  return DATE_FNS_LOCALES[language];
}

/** The date-fns locale matching the currently active i18n language. */
export function useDateFnsLocale(): Locale {
  const { i18n } = useTranslation();
  return dateFnsLocale(normalizeSupportedLanguage(i18n.resolvedLanguage));
}
