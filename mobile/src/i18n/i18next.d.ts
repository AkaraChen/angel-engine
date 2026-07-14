import type { en } from "./locales/en";

import "i18next";

/**
 * Bind i18next's key typing to the English resource so `t("...")` calls and
 * `labelKey` strings fail typecheck when a key is missing or misspelled. Every
 * locale is validated against `LocaleResource` via `satisfies`, so `en` is a
 * faithful stand-in for the shared schema and keeps keys and translations in
 * lockstep.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: typeof en;
  }
}
