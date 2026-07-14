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
 * Match a single BCP-47 tag against the eight supported languages, returning
 * `null` when the tag maps to no supported language. Unlike
 * {@link normalizeSupportedLanguage} this does NOT silently fall back to
 * English, so a preference list can distinguish "explicitly English" from
 * "unsupported" and keep scanning.
 */
export function matchSupportedLanguage(
  language: string | null | undefined,
): SupportedLanguage | null {
  if (typeof language !== "string" || language.length === 0) return null;
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
  if (normalized.startsWith("en")) return "en";

  return null;
}

/**
 * Map an arbitrary BCP-47 tag (e.g. from `navigator.language`) onto one of the
 * eight supported languages, matching the desktop normalization so both clients
 * resolve the same regional variants. Falls back to English.
 */
export function normalizeSupportedLanguage(
  language: string | null | undefined,
): SupportedLanguage {
  return matchSupportedLanguage(language) ?? "en";
}

/**
 * Pick the first supported language from an ordered preference list (e.g.
 * `navigator.languages`). This honours a user whose primary locale is
 * unsupported but whose secondary preference is one we ship, instead of jumping
 * straight to English. Falls back to English when nothing matches.
 */
export function detectPreferredLanguage(
  candidates: ReadonlyArray<string | null | undefined>,
): SupportedLanguage {
  for (const candidate of candidates) {
    const matched = matchSupportedLanguage(candidate);
    if (matched !== null) return matched;
  }
  return "en";
}
