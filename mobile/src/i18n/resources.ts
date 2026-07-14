import type { LocaleResource } from "./locales/schema";

import { de } from "./locales/de";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { zhCN } from "./locales/zh-CN";
import { zhTW } from "./locales/zh-TW";

export const supportedLanguages = [
  "en",
  "zh-CN",
  "zh-TW",
  "fr",
  "de",
  "ko",
  "ja",
  "es",
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const resources = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  fr,
  de,
  ko,
  ja,
  es,
} satisfies Record<SupportedLanguage, LocaleResource>;

/**
 * Map an arbitrary BCP-47 tag (e.g. from `navigator.language`) onto one of the
 * eight supported languages, matching the desktop normalization so both clients
 * resolve the same regional variants. Falls back to English.
 */
export function normalizeSupportedLanguage(
  language: string | null | undefined,
): SupportedLanguage {
  if (typeof language !== "string" || language.length === 0) return "en";
  const normalized = language.toLowerCase();

  if (
    normalized === "zh-tw" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo" ||
    normalized.includes("hant")
  ) {
    return "zh-TW";
  }

  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("es")) return "es";

  return "en";
}
