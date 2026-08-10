/**
 * The in-app display language, mirrored from the i18n module's
 * `languageChanged` persistence (`angel-engine.language` in localStorage,
 * see renderer/i18n/index.ts). Read directly here so date/time formatting
 * can follow the app language without importing the i18n module — that
 * module pulls the settings store and the IPC bridge into every consumer,
 * including jsdom tests where the bridge does not exist.
 */
const LANGUAGE_STORAGE_KEY = "angel-engine.language";

export function appLocale(): string {
  try {
    return (
      window.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ??
      window.navigator.language
    );
  } catch {
    return window.navigator.language;
  }
}
