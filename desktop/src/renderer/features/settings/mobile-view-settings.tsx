import { Check, Copy } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { ResetMobilePasswordDialog } from "@/features/settings/reset-mobile-password-dialog";
import {
  SettingsGroup,
  SettingsRow,
} from "@/features/settings/settings-controls";
import { useMobileHosting } from "@/features/settings/use-mobile-hosting";

export function MobileViewSettings() {
  const { t } = useTranslation();
  const {
    enableWithPassword,
    isSaving,
    listenAddresses,
    setEnabled,
    setHost,
    setPassword,
    setPort,
    state,
  } = useMobileHosting();
  const [portDraft, setPortDraft] = useState(String(state.listenPort));
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [enableAfterPassword, setEnableAfterPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const lastPortRef = useRef(state.listenPort);
  if (lastPortRef.current !== state.listenPort) {
    lastPortRef.current = state.listenPort;
    setPortDraft(String(state.listenPort));
  }

  const commitPort = () => {
    const next = Number(portDraft);
    if (
      !Number.isInteger(next) ||
      next < 0 ||
      next > 65_535 ||
      next === state.listenPort
    ) {
      setPortDraft(String(state.listenPort));
      return;
    }
    void setPort(next);
  };

  const copyUrl = () => {
    if (state.url === null) return;
    void navigator.clipboard.writeText(state.url).then(() => {
      setCopied(true);
      window.setTimeout(setCopied, 1500, false);
    });
  };

  const setMobileEnabled = (enabled: boolean) => {
    if (enabled && !state.hasPassword) {
      setEnableAfterPassword(true);
      setPasswordDialogOpen(true);
      return;
    }
    void setEnabled(enabled);
  };
  const openPasswordDialog = () => {
    setEnableAfterPassword(false);
    setPasswordDialogOpen(true);
  };
  const setPasswordDialog = (open: boolean) => {
    setPasswordDialogOpen(open);
    if (!open) setEnableAfterPassword(false);
  };

  const urlDescription = !state.enabled
    ? t("settings.mobile.urlDisabled")
    : !state.hasPassword
      ? t("settings.mobile.urlNeedsPassword")
      : state.url !== null
        ? state.url
        : t("settings.mobile.urlPending");

  return (
    <SettingsGroup>
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.mobile.enabledTitle")}
            checked={state.enabled}
            disabled={isSaving}
            onCheckedChange={setMobileEnabled}
          />
        }
        description={t("settings.mobile.enabledDescription")}
        title={t("settings.mobile.enabledTitle")}
      />
      <SettingsRow
        after={
          <Button
            disabled={isSaving}
            onClick={openPasswordDialog}
            size="sm"
            type="button"
            variant="outline"
          >
            {state.hasPassword
              ? t("settings.mobile.passwordReset")
              : t("settings.mobile.passwordSet")}
          </Button>
        }
        description={t("settings.mobile.passwordDescription")}
        title={t("settings.mobile.passwordTitle")}
      />
      <SettingsRow
        after={
          <NativeSelect
            aria-label={t("settings.mobile.hostTitle")}
            className="w-56"
            disabled={isSaving || listenAddresses.length === 0}
            onChange={(event) => void setHost(event.currentTarget.value)}
            selectClassName="bg-background"
            size="sm"
            value={state.host}
          >
            {!listenAddresses.some(
              (candidate) => candidate.address === state.host,
            ) && (
              <NativeSelectOption value={state.host}>
                {state.host}
              </NativeSelectOption>
            )}
            {listenAddresses.map((candidate) => (
              <NativeSelectOption
                key={`${candidate.interfaceName}:${candidate.address}`}
                value={candidate.address}
              >
                {candidate.interfaceName === "*"
                  ? candidate.address
                  : `${candidate.interfaceName} — ${candidate.address}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        }
        description={t("settings.mobile.hostDescription")}
        title={t("settings.mobile.hostTitle")}
      />
      <SettingsRow
        after={
          <Input
            aria-label={t("settings.mobile.portTitle")}
            className="h-8 w-40 bg-background text-sm"
            disabled={isSaving}
            max={65_535}
            min={0}
            onBlur={commitPort}
            onChange={(event) => setPortDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            type="number"
            value={portDraft}
          />
        }
        description={t("settings.mobile.portDescription")}
        title={t("settings.mobile.portTitle")}
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
        description={urlDescription}
        title={t("settings.mobile.urlTitle")}
      />
      <ResetMobilePasswordDialog
        isSaving={isSaving}
        onOpenChange={setPasswordDialog}
        onSave={enableAfterPassword ? enableWithPassword : setPassword}
        open={passwordDialogOpen}
      />
    </SettingsGroup>
  );
}
