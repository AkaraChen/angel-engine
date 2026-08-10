import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  SettingsRow,
  SettingsSection,
} from "@/features/settings/settings-section";
import { useDaemonHealth } from "@/platform/use-daemon-health";

type CopyState = "copied" | "failed" | "idle";

/**
 * Product identity for diagnostics. No Support URL is shipped until a
 * canonical destination is approved (plan 045 STOP).
 */
export function AboutSection() {
  const { t } = useTranslation();
  const health = useDaemonHealth();
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const buildLabel = useMemo(() => {
    const version =
      typeof import.meta.env.VITE_APP_VERSION === "string" &&
      import.meta.env.VITE_APP_VERSION.length > 0
        ? import.meta.env.VITE_APP_VERSION
        : "dev";
    return version;
  }, []);

  // Secret-free by construction: app build, page origin, and daemon version
  // only — never the pairing token or request payloads.
  const diagnostics = useMemo(() => {
    const parts = [
      `app=${buildLabel}`,
      `origin=${typeof window !== "undefined" ? window.location.origin : ""}`,
    ];
    if (health.data?.version) {
      parts.push(`daemon=${health.data.version}`);
    }
    return parts.join("\n");
  }, [buildLabel, health.data?.version]);

  async function copyDiagnostics() {
    // The app is served over LAN HTTP, where the Clipboard API is often
    // unavailable; surface that honestly instead of failing silently.
    const clipboard =
      typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clipboard?.writeText === undefined) {
      setCopyState("failed");
      return;
    }
    try {
      await clipboard.writeText(diagnostics);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <SettingsSection
      description={t("settings.about.description")}
      title={t("settings.about.title")}
    >
      <SettingsRow
        description={t("settings.about.appDescription")}
        title={t("settings.about.appName")}
      />
      <SettingsRow description={buildLabel} title={t("settings.about.build")} />
      <SettingsRow
        description={
          <span className="flex flex-col items-start gap-1">
            <button
              className="text-left text-sm text-primary-strong underline-offset-2 hover:underline"
              onClick={() => void copyDiagnostics()}
              type="button"
            >
              {t("settings.about.copyDiagnostics")}
            </button>
            {copyState === "copied" ? (
              <span className="text-xs text-muted-foreground">
                {t("settings.about.copied")}
              </span>
            ) : copyState === "failed" ? (
              <span className="text-xs text-destructive" role="alert">
                {t("settings.about.copyFailed")}
              </span>
            ) : null}
          </span>
        }
        title={t("settings.about.diagnostics")}
      />
    </SettingsSection>
  );
}
