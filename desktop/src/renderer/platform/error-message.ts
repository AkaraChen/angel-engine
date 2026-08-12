import is from "@sindresorhus/is";
import i18n from "i18next";

const localizedMainErrorKeys = {
  "daemon-unavailable": "common.backendUnavailable",
  "main-operation-failed": "common.desktopOperationFailed",
} as const;

export function localizedErrorMessage(error: unknown): string {
  if (is.plainObject(error) && is.string(error.code)) {
    const key =
      localizedMainErrorKeys[error.code as keyof typeof localizedMainErrorKeys];
    if (key) return i18n.t(key);
  }
  return error instanceof Error ? error.message : String(error);
}
