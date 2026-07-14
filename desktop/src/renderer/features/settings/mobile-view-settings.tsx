import { Check, Copy } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  SettingsGroup,
  SettingsRow,
} from "@/features/settings/settings-controls";
import { useMobileHosting } from "@/features/settings/use-mobile-hosting";

export function MobileViewSettings() {
  const { t } = useTranslation();
  const { isSaving, setEnabled, setHost, state } = useMobileHosting();
  const [hostDraft, setHostDraft] = useState(state.host);
  const [copied, setCopied] = useState(false);

  // Adopt the persisted host when it changes elsewhere (e.g. another window).
  // Adjusting state during render is React's recommended alternative to a
  // syncing effect here.
  const lastHostRef = useRef(state.host);
  if (lastHostRef.current !== state.host) {
    lastHostRef.current = state.host;
    setHostDraft(state.host);
  }

  const commitHost = () => {
    const next = hostDraft.trim();
    if (next.length === 0 || next === state.host) {
      setHostDraft(state.host);
      return;
    }
    void setHost(next);
  };

  const copyUrl = () => {
    if (state.url === null) return;
    void navigator.clipboard.writeText(state.url).then(() => {
      setCopied(true);
      window.setTimeout(setCopied, 1500, false);
    });
  };

  return (
    <SettingsGroup>
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.mobile.enabledTitle")}
            checked={state.enabled}
            disabled={isSaving}
            onCheckedChange={(checked) => void setEnabled(checked)}
          />
        }
        description={t("settings.mobile.enabledDescription")}
        title={t("settings.mobile.enabledTitle")}
      />
      <SettingsRow
        after={
          <Input
            aria-label={t("settings.mobile.hostTitle")}
            className="h-8 w-40 bg-background text-sm"
            disabled={isSaving}
            onBlur={commitHost}
            onChange={(event) => setHostDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            placeholder="0.0.0.0"
            spellCheck={false}
            value={hostDraft}
          />
        }
        description={t("settings.mobile.hostDescription")}
        title={t("settings.mobile.hostTitle")}
      />
      <SettingsRow
        after={
          state.url !== null ? (
            <Button
              className="gap-1.5"
              onClick={copyUrl}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? <Check /> : <Copy />}
              {copied ? t("settings.mobile.copied") : t("settings.mobile.copy")}
            </Button>
          ) : null
        }
        description={
          state.enabled
            ? state.url !== null
              ? state.url
              : t("settings.mobile.urlPending")
            : t("settings.mobile.urlDisabled")
        }
        title={t("settings.mobile.urlTitle")}
      />
    </SettingsGroup>
  );
}
