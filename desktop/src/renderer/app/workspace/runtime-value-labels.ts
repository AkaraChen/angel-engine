import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Runtime option ids are already canonical when they reach the renderer, but
 * each runtime spells its closed-set ids differently (`on-request` for Codex,
 * `acceptEdits` for Qoder, `autoEdit` for Gemini). Display lookup therefore
 * keys on a punctuation/case-insensitive form of the id; unknown ids keep the
 * runtime-provided label instead of failing.
 */
export type RuntimeValueLabeler = (
  value: string,
  fallbackLabel: string,
) => string;

export interface RuntimeValueLabelers {
  mode: RuntimeValueLabeler;
  model: RuntimeValueLabeler;
  permissionMode: RuntimeValueLabeler;
  reasoningEffort: RuntimeValueLabeler;
}

type RuntimeValueSection = "mode" | "permissionMode" | "reasoningEffort";

const MODE_KEYS = {
  acceptedits: "acceptEdits",
  agent: "agent",
  architect: "architect",
  ask: "ask",
  build: "build",
  bypasspermissions: "bypassPermissions",
  chat: "chat",
  code: "code",
  default: "default",
  edit: "edit",
  plan: "plan",
  yolo: "yolo",
} as const;

const PERMISSION_MODE_KEYS = {
  acceptedits: "acceptEdits",
  allowall: "allowAll",
  always: "always",
  auto: "auto",
  autoedit: "autoEdit",
  bypasspermissions: "bypassPermissions",
  default: "default",
  dontask: "dontAsk",
  never: "never",
  onfailure: "onFailure",
  onrequest: "onRequest",
  plan: "plan",
  readonly: "readOnly",
  untrusted: "untrusted",
  yolo: "yolo",
} as const;

const REASONING_EFFORT_KEYS = {
  high: "high",
  low: "low",
  medium: "medium",
  minimal: "minimal",
  none: "none",
  xhigh: "xhigh",
} as const;

const RUNTIME_VALUE_KEYS: Record<
  RuntimeValueSection,
  Readonly<Record<string, string>>
> = {
  mode: MODE_KEYS,
  permissionMode: PERMISSION_MODE_KEYS,
  reasoningEffort: REASONING_EFFORT_KEYS,
};

const keepRuntimeLabel: RuntimeValueLabeler = (_value, fallbackLabel) =>
  fallbackLabel;

export function runtimeValueLabeler(
  section: RuntimeValueSection,
  t: TFunction,
): RuntimeValueLabeler {
  return (value, fallbackLabel) => {
    const key = RUNTIME_VALUE_KEYS[section][normalizeRuntimeValue(value)];
    return key === undefined
      ? fallbackLabel
      : t(`runtimeValues.${section}.${key}`);
  };
}

export function useRuntimeValueLabelers(): RuntimeValueLabelers {
  const { t } = useTranslation();

  return useMemo(
    () => ({
      mode: runtimeValueLabeler("mode", t),
      // Model ids are open-ended product names and stay as the runtime reports them.
      model: keepRuntimeLabel,
      permissionMode: runtimeValueLabeler("permissionMode", t),
      reasoningEffort: runtimeValueLabeler("reasoningEffort", t),
    }),
    [t],
  );
}

function normalizeRuntimeValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
