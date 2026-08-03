import type { TFunction } from "i18next";

import is from "@sindresorhus/is";

/** Subset of ChatElicitationResponse["type"] used for local decision labels. */
export type ElicitationDecisionType =
  | "allow"
  | "allowForSession"
  | "answers"
  | "cancel"
  | "deny"
  | "dynamicToolResult"
  | "externalComplete"
  | "raw";

/**
 * One-line subject for a resolved elicitation: prefer the body (often the
 * command or path that was approved), collapse whitespace, fall back to title.
 */
export function elicitationResolvedSubject(
  elicitation: { body?: string | null; title?: string | null },
  fallbackTitle: string,
): string {
  if (is.nonEmptyString(elicitation.body)) {
    const compacted = elicitation.body.replace(/\s+/g, " ").trim();
    if (compacted.length > 0) return compacted;
  }
  if (is.nonEmptyString(elicitation.title)) return elicitation.title;
  return fallbackTitle;
}

export function formatElicitationDecision(
  phase: string,
  responseType: ElicitationDecisionType | undefined,
  isPermissionRequest: boolean,
  t: TFunction,
  formatPhase: (phase: string, t: TFunction) => string,
): string {
  if (responseType !== undefined) {
    switch (responseType) {
      case "allow":
        return t("common.allow");
      case "allowForSession":
        return t("common.allowSession");
      case "deny":
        return t("common.deny");
      case "cancel":
        return t("common.cancelled");
      case "answers":
      case "raw":
      case "dynamicToolResult":
      case "externalComplete":
        return t("common.answered");
      default:
        return formatPhase(phase, t);
    }
  }
  // After reload we only have the phase. Deny/cancel both map to cancelled;
  // allow* map to resolved — treat permission resolved as "Allow".
  if (phase === "cancelled") {
    return isPermissionRequest ? t("common.declined") : t("common.cancelled");
  }
  if (phase.startsWith("resolved:")) {
    return isPermissionRequest ? t("common.allow") : t("common.answered");
  }
  return formatPhase(phase, t);
}

export function isNegativeElicitationDecision(
  phase: string,
  responseType: ElicitationDecisionType | undefined,
): boolean {
  if (responseType !== undefined) {
    return responseType === "deny" || responseType === "cancel";
  }
  return phase === "cancelled";
}
