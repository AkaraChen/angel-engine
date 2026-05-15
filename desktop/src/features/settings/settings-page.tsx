import type { KeyboardEvent, ReactNode } from "react";
import type { SupportedLanguage } from "@/i18n";
import type { DesktopThemeMode } from "@/platform/theme";
import type { AgentRuntime, AgentSettings } from "@/shared/agents";
import claudeIconUrl from "@lobehub/icons-static-svg/icons/claudecode-color.svg";
import clineIconUrl from "@lobehub/icons-static-svg/icons/cline.svg";
import codexIconUrl from "@lobehub/icons-static-svg/icons/codex-color.svg";
import copilotIconUrl from "@lobehub/icons-static-svg/icons/copilot-color.svg";
import cursorIconUrl from "@lobehub/icons-static-svg/icons/cursor.svg";
import geminiIconUrl from "@lobehub/icons-static-svg/icons/geminicli-color.svg";
import kimiIconUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import opencodeIconUrl from "@lobehub/icons-static-svg/icons/opencode.svg";

import qoderIconUrl from "@lobehub/icons-static-svg/icons/qoder-color.svg";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/features/settings/settings-store";
import { useThemeSettings } from "@/features/settings/use-theme-settings";
import { languageOptions } from "@/i18n";
import { cn } from "@/platform/utils";
import { AGENT_OPTIONS, getEnabledAgentOptions } from "@/shared/agents";

type SettingsTab = "agents" | "appearance" | "danger";

const settingsTabs: Array<{ id: SettingsTab; labelKey: string }> = [
  { id: "agents", labelKey: "settings.tabs.agents" },
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "danger", labelKey: "settings.tabs.danger" },
];

const themeModeOptions: Array<{
  labelKey: string;
  value: DesktopThemeMode;
}> = [
  { labelKey: "settings.appearance.themeOptions.system", value: "system" },
  { labelKey: "settings.appearance.themeOptions.light", value: "light" },
  { labelKey: "settings.appearance.themeOptions.dark", value: "dark" },
];

const agentIconUrl: Record<AgentRuntime, string> = {
  claude: claudeIconUrl,
  cline: clineIconUrl,
  codex: codexIconUrl,
  copilot: copilotIconUrl,
  cursor: cursorIconUrl,
  gemini: geminiIconUrl,
  kimi: kimiIconUrl,
  opencode: opencodeIconUrl,
  qoder: qoderIconUrl,
};

export function SettingsPage({
  agentSettings,
  isDeletingChats,
  onAgentEnabledChange,
  onDeleteAllChats,
  onDefaultAgentChange,
}: {
  agentSettings: AgentSettings;
  isDeletingChats: boolean;
  onAgentEnabledChange: (runtime: AgentRuntime, enabled: boolean) => void;
  onDeleteAllChats: () => Promise<void>;
  onDefaultAgentChange: (runtime: AgentRuntime) => void;
}) {
  const { t } = useTranslation();
  const tabPanelId = useId();
  const [activeTab, setActiveTab] = useState<SettingsTab>("agents");
  const [themeMode, setThemeMode] = useThemeSettings();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const enabledAgentOptions = getEnabledAgentOptions(agentSettings);
  const enabledRuntimeSet = new Set(agentSettings.enabledRuntimes);
  const activeTabLabel = t(
    settingsTabs.find((tab) => tab.id === activeTab)?.labelKey ??
      settingsTabs[0].labelKey,
  );

  const deleteAllChats = useCallback(async () => {
    const confirmed = await window.desktopWindow.confirmDeleteAllChats();
    if (!confirmed) return;

    await onDeleteAllChats();
  }, [onDeleteAllChats]);

  const selectAdjacentTab = useCallback(
    (currentTab: SettingsTab, direction: -1 | 1) => {
      const currentIndex = settingsTabs.findIndex(
        (tab) => tab.id === currentTab,
      );
      const nextIndex =
        (currentIndex + direction + settingsTabs.length) % settingsTabs.length;
      const nextTab = settingsTabs[nextIndex].id;
      setActiveTab(nextTab);
      window.requestAnimationFrame(() => {
        document.getElementById(`${tabPanelId}-${nextTab}-tab`)?.focus();
      });
    },
    [tabPanelId],
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tab: SettingsTab) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        selectAdjacentTab(tab, -1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        selectAdjacentTab(tab, 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        const firstTab = settingsTabs[0].id;
        setActiveTab(firstTab);
        window.requestAnimationFrame(() => {
          document.getElementById(`${tabPanelId}-${firstTab}-tab`)?.focus();
        });
      } else if (event.key === "End") {
        event.preventDefault();
        const lastTab = settingsTabs[settingsTabs.length - 1].id;
        setActiveTab(lastTab);
        window.requestAnimationFrame(() => {
          document.getElementById(`${tabPanelId}-${lastTab}-tab`)?.focus();
        });
      }
    },
    [selectAdjacentTab, tabPanelId],
  );

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside
        className="
          flex w-48 shrink-0 flex-col border-r border-border/70 bg-sidebar/80
          px-3 pt-14
        "
        data-electron-drag
      >
        <h1
          className="
          px-2 pb-4 text-[13px] font-semibold text-sidebar-foreground
        "
        >
          {t("settings.title")}
        </h1>
        <nav
          aria-label={t("settings.title")}
          aria-orientation="vertical"
          className="flex flex-col gap-1"
          role="tablist"
          data-electron-no-drag
        >
          {settingsTabs.map((tab) => (
            <button
              aria-controls={`${tabPanelId}-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={cn(
                `
                  flex h-8 items-center rounded-md px-2 text-left text-[13px]
                  font-medium text-sidebar-foreground/70 transition-colors
                  outline-none
                  hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                  focus-visible:ring-2 focus-visible:ring-ring/30
                `,
                activeTab === tab.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "bg-transparent",
              )}
              id={`${tabPanelId}-${tab.id}-tab`}
              key={tab.id}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 flex-1 overflow-auto">
        <div
          className="
          mx-auto flex w-full max-w-2xl flex-col gap-5 px-8 pt-14 pb-8
        "
        >
          <h2 className="text-xl font-semibold tracking-normal">
            {activeTabLabel}
          </h2>

          {activeTab === "agents" ? (
            <div
              aria-labelledby={`${tabPanelId}-agents-tab`}
              className="space-y-5"
              id={`${tabPanelId}-agents`}
              role="tabpanel"
            >
              <SettingsGroup>
                <>
                  {AGENT_OPTIONS.map((agent) => {
                    const enabled = enabledRuntimeSet.has(agent.id);
                    const isOnlyEnabled =
                      enabled && agentSettings.enabledRuntimes.length <= 1;

                    return (
                      <SettingsRow
                        after={
                          <AgentEnabledSwitch
                            checked={enabled}
                            disabled={isOnlyEnabled}
                            label={t("settings.agents.enabledLabel", {
                              agent: agent.label,
                            })}
                            onCheckedChange={(checked) =>
                              onAgentEnabledChange(agent.id, checked)
                            }
                          />
                        }
                        key={agent.id}
                        muted={!enabled}
                      >
                        <span
                          className="
                              flex size-9 shrink-0 items-center justify-center
                              rounded-lg border border-foreground/10
                              bg-background
                            "
                        >
                          <img
                            alt=""
                            className="size-5 object-contain"
                            draggable={false}
                            src={agentIconUrl[agent.id]}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="
                                block truncate text-sm font-medium
                              "
                          >
                            {agent.label}
                          </span>
                        </span>
                      </SettingsRow>
                    );
                  })}
                </>
              </SettingsGroup>

              <SettingsGroup>
                <SettingsRow
                  after={
                    <SettingsSelect
                      label={t("settings.agents.defaultTitle")}
                      onValueChange={(value) =>
                        onDefaultAgentChange(value as AgentRuntime)
                      }
                      options={enabledAgentOptions.map((agent) => ({
                        label: agent.label,
                        value: agent.id,
                      }))}
                      value={agentSettings.defaultRuntime}
                    />
                  }
                  description={t("settings.agents.defaultDescription")}
                  title={t("settings.agents.defaultTitle")}
                />
              </SettingsGroup>
            </div>
          ) : null}

          {activeTab === "appearance" ? (
            <div
              aria-labelledby={`${tabPanelId}-appearance-tab`}
              id={`${tabPanelId}-appearance`}
              role="tabpanel"
            >
              <SettingsGroup>
                <SettingsRow
                  after={
                    <SettingsSelect
                      label={t("settings.appearance.theme")}
                      onValueChange={(value) =>
                        setThemeMode(value as DesktopThemeMode)
                      }
                      options={themeModeOptions.map((option) => ({
                        label: t(option.labelKey),
                        value: option.value,
                      }))}
                      value={themeMode}
                    />
                  }
                  title={t("settings.appearance.theme")}
                />
                <SettingsRow
                  after={
                    <SettingsSelect
                      label={t("settings.appearance.language")}
                      onValueChange={(value) =>
                        setLanguage(value as SupportedLanguage)
                      }
                      options={languageOptions.map((option) => ({
                        label: t(option.labelKey),
                        value: option.value,
                      }))}
                      value={language}
                    />
                  }
                  title={t("settings.appearance.language")}
                />
              </SettingsGroup>
            </div>
          ) : null}

          {activeTab === "danger" ? (
            <div
              aria-labelledby={`${tabPanelId}-danger-tab`}
              id={`${tabPanelId}-danger`}
              role="tabpanel"
            >
              <SettingsGroup>
                <SettingsRow
                  after={
                    <Button
                      disabled={isDeletingChats}
                      onClick={() => void deleteAllChats()}
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 />
                      {isDeletingChats
                        ? t("settings.danger.deleting")
                        : t("settings.danger.deleteTitle")}
                    </Button>
                  }
                  description={t("settings.danger.description")}
                  icon={<AlertTriangle className="size-4 text-destructive" />}
                  title={t("settings.danger.deleteTitle")}
                  variant="destructive"
                />
              </SettingsGroup>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="space-y-2">
      {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      <div
        className="
        divide-y divide-border overflow-hidden rounded-lg border bg-card
      "
      >
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  after,
  children,
  description,
  icon,
  muted,
  title,
  variant,
}: {
  after: ReactNode;
  children?: ReactNode;
  description?: string;
  icon?: ReactNode;
  muted?: boolean;
  title?: string;
  variant?: "destructive";
}) {
  return (
    <article
      className={cn(
        "flex min-h-12 items-center gap-3 px-4 py-3 transition-colors",
        muted && "text-muted-foreground",
      )}
    >
      {icon ? (
        <span
          className="
              flex size-8 shrink-0 items-center justify-center rounded-md border
              border-foreground/10 bg-background
            "
        >
          {icon}
        </span>
      ) : null}
      {children ?? (
        <span className="min-w-0 flex-1">
          {title ? (
            <span
              className={cn(
                "block text-sm font-medium",
                variant === "destructive" && "text-destructive",
              )}
            >
              {title}
            </span>
          ) : null}
          {description ? (
            <span className="mt-1 block text-sm text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      )}
      <span className="ml-auto shrink-0">{after}</span>
    </article>
  );
}

function SettingsSelect({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label
      className="
      flex min-w-44 flex-col gap-1.5 text-xs font-medium text-muted-foreground
    "
    >
      <NativeSelect
        aria-label={label}
        className="w-full"
        onChange={(event) => onValueChange(event.currentTarget.value)}
        selectClassName="h-8 w-full rounded-md border-border bg-background py-0 pr-8 pl-3 text-xs"
        size="sm"
        value={value}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  );
}

function AgentEnabledSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Switch
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      title={disabled ? t("settings.agents.minimumEnabled") : label}
    />
  );
}
