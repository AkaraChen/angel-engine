import type {
  AgentOption,
  AgentRuntime,
  AgentSettings,
} from "@angel-engine/daemon-api/agents";
import type { KeyboardEvent } from "react";
import type { SettingsTab } from "@/features/settings/settings-tabs";
import type { SupportedLanguage } from "@/i18n";
import type { DesktopThemeMode } from "@/platform/theme";
import {
  isCustomAgentRuntime,
  sortAgentOptionsBySettings,
} from "@angel-engine/daemon-api/agents";
import {
  WarningCircle as AlertTriangle,
  Trash as Trash2,
} from "@phosphor-icons/react";

import { useQueryClient } from "@tanstack/react-query";
import { m } from "framer-motion";
import { useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArchivedSettingsPanel } from "@/features/settings/archived-settings-panel";
import { BuiltinAgentsSettingsGroup } from "@/features/settings/builtin-agent-settings";
import { CustomAgentsSettingsGroup } from "@/features/settings/custom-agent-settings";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSelect,
} from "@/features/settings/settings-controls";
import { useSettingsStore } from "@/features/settings/settings-store";
import { settingsTabs } from "@/features/settings/settings-tabs";
import { useThemeSettings } from "@/features/settings/use-theme-settings";
import { languageOptions } from "@/i18n";
import { springs } from "@/platform/motion";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

const themeModeOptions: Array<{
  labelKey: string;
  value: DesktopThemeMode;
}> = [
  { labelKey: "settings.appearance.themeOptions.system", value: "system" },
  { labelKey: "settings.appearance.themeOptions.light", value: "light" },
  { labelKey: "settings.appearance.themeOptions.dark", value: "dark" },
];

export function SettingsPage({
  agentSettings,
  availableAgentOptions,
  isDeletingChats,
  onAgentEnabledChange,
  onAgentOrderChange,
  onDeleteAllChats,
}: {
  agentSettings: AgentSettings;
  availableAgentOptions: AgentOption[];
  isDeletingChats: boolean;
  onAgentEnabledChange: (runtime: AgentRuntime, enabled: boolean) => void;
  onAgentOrderChange: (orderedRuntimes: AgentRuntime[]) => void;
  onDeleteAllChats: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tabPanelId = useId();
  const [activeTab, setActiveTab] = useState<SettingsTab>("agents");
  const [themeMode, setThemeMode] = useThemeSettings();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const worktreeDirtyPromptEnabled = useSettingsStore(
    (state) => state.worktreeDirtyPromptEnabled,
  );
  const setWorktreeDirtyPromptEnabled = useSettingsStore(
    (state) => state.setWorktreeDirtyPromptEnabled,
  );
  const customAgents = useSettingsStore((state) => state.customAgents);
  const createCustomAgent = useSettingsStore(
    (state) => state.createCustomAgent,
  );
  const updateCustomAgent = useSettingsStore(
    (state) => state.updateCustomAgent,
  );
  const deleteCustomAgent = useSettingsStore(
    (state) => state.deleteCustomAgent,
  );
  const deleteCustomAgentImpact = useSettingsStore(
    (state) => state.deleteCustomAgentImpact,
  );
  const enabledRuntimeSet = useMemo(
    () => new Set(agentSettings.enabledRuntimes),
    [agentSettings.enabledRuntimes],
  );
  const orderedAgentOptions = useMemo(
    () => sortAgentOptionsBySettings(agentSettings, availableAgentOptions),
    [agentSettings, availableAgentOptions],
  );
  const orderedBuiltinAgentOptions = orderedAgentOptions.filter(
    (agent) => !isCustomAgentRuntime(agent.id),
  );
  const enabledBuiltinAgentOptions = orderedBuiltinAgentOptions.filter(
    (agent) => enabledRuntimeSet.has(agent.id),
  );
  const disabledBuiltinAgentOptions = orderedBuiltinAgentOptions.filter(
    (agent) => !enabledRuntimeSet.has(agent.id),
  );
  const builtinAgentOptions = [
    ...enabledBuiltinAgentOptions,
    ...disabledBuiltinAgentOptions,
  ];
  const customAgentsById = useMemo(
    () => new Map(customAgents.map((agent) => [agent.id, agent])),
    [customAgents],
  );
  const orderedCustomAgents = useMemo(() => {
    const ordered = orderedAgentOptions.flatMap((agent) => {
      if (!isCustomAgentRuntime(agent.id)) return [];
      const customAgent = customAgentsById.get(agent.id);
      return customAgent ? [customAgent] : [];
    });
    const orderedSet = new Set(ordered.map((agent) => agent.id));

    return [
      ...ordered,
      ...customAgents.filter((agent) => !orderedSet.has(agent.id)),
    ];
  }, [customAgents, customAgentsById, orderedAgentOptions]);
  const enabledCustomAgents = orderedCustomAgents.filter((agent) =>
    enabledRuntimeSet.has(agent.id),
  );
  const disabledCustomAgents = orderedCustomAgents.filter(
    (agent) => !enabledRuntimeSet.has(agent.id),
  );
  const visibleCustomAgents = [...enabledCustomAgents, ...disabledCustomAgents];
  const enabledBuiltinAgentRuntimeOrder = useMemo(
    () => enabledBuiltinAgentOptions.map((agent) => agent.id),
    [enabledBuiltinAgentOptions],
  );
  const disabledBuiltinAgentRuntimeOrder = useMemo(
    () => disabledBuiltinAgentOptions.map((agent) => agent.id),
    [disabledBuiltinAgentOptions],
  );
  const builtinAgentRuntimeOrder = useMemo(
    () => [
      ...enabledBuiltinAgentRuntimeOrder,
      ...disabledBuiltinAgentRuntimeOrder,
    ],
    [disabledBuiltinAgentRuntimeOrder, enabledBuiltinAgentRuntimeOrder],
  );
  const customAgentRuntimeOrder = visibleCustomAgents.map((agent) => agent.id);
  const visibleEnabledCount = orderedAgentOptions.filter((agent) =>
    enabledRuntimeSet.has(agent.id),
  ).length;
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
          {settingsTabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                aria-controls={`${tabPanelId}-${tab.id}`}
                aria-selected={isActive}
                className={cn(
                  `
                    relative flex h-8 items-center gap-2 rounded-md px-2
                    text-left text-[13px] font-medium text-sidebar-foreground/70
                    transition-colors outline-none
                    hover:text-sidebar-accent-foreground
                    focus-visible:ring-2 focus-visible:ring-ring/30
                  `,
                  isActive
                    ? `
                      text-primary-soft-foreground
                      hover:text-primary-soft-foreground
                    `
                    : "hover:bg-sidebar-accent",
                )}
                id={`${tabPanelId}-${tab.id}-tab`}
                key={tab.id}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {isActive ? (
                  <m.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-md bg-primary-soft"
                    layoutId="settings-active-tab"
                    transition={springs.snappy}
                  />
                ) : null}
                <TabIcon
                  className="relative size-3.5 shrink-0 opacity-80"
                  weight="duotone"
                />
                <span className="relative">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 flex-1 overflow-auto">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-5 px-8 pt-14 pb-8",
            activeTab === "archived" ? "max-w-4xl" : "max-w-2xl",
          )}
        >
          <h2 className="font-display text-xl font-semibold tracking-[-0.015em]">
            {activeTabLabel}
          </h2>

          {activeTab === "agents" ? (
            <div
              aria-labelledby={`${tabPanelId}-agents-tab`}
              className="space-y-5"
              id={`${tabPanelId}-agents`}
              role="tabpanel"
            >
              <BuiltinAgentsSettingsGroup
                agentOptions={builtinAgentOptions}
                customAgentRuntimeOrder={customAgentRuntimeOrder}
                enabledRuntimeSet={enabledRuntimeSet}
                visibleEnabledCount={visibleEnabledCount}
                onAgentEnabledChange={onAgentEnabledChange}
                onAgentOrderChange={onAgentOrderChange}
              />
              <CustomAgentsSettingsGroup
                customAgents={visibleCustomAgents}
                enabledRuntimeSet={enabledRuntimeSet}
                visibleEnabledCount={visibleEnabledCount}
                onAgentEnabledChange={onAgentEnabledChange}
                onAgentOrderChange={(orderedCustomRuntimes) =>
                  onAgentOrderChange([
                    ...builtinAgentRuntimeOrder,
                    ...orderedCustomRuntimes,
                  ])
                }
                onCreateCustomAgent={createCustomAgent}
                onDeleteCustomAgent={deleteCustomAgent}
                onDeletedCustomAgent={async () => {
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.chats.all(),
                  });
                }}
                onDeleteCustomAgentImpact={deleteCustomAgentImpact}
                onUpdateCustomAgent={updateCustomAgent}
              />
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

          {activeTab === "workspace" ? (
            <div
              aria-labelledby={`${tabPanelId}-workspace-tab`}
              id={`${tabPanelId}-workspace`}
              role="tabpanel"
            >
              <SettingsGroup>
                <SettingsRow
                  after={
                    <Switch
                      aria-label={t(
                        "settings.workspace.dirtyPromptSwitchLabel",
                      )}
                      checked={worktreeDirtyPromptEnabled}
                      onCheckedChange={setWorktreeDirtyPromptEnabled}
                    />
                  }
                  description={t("settings.workspace.dirtyPromptDescription")}
                  title={t("settings.workspace.dirtyPromptTitle")}
                />
              </SettingsGroup>
            </div>
          ) : null}

          {activeTab === "archived" ? (
            <div
              aria-labelledby={`${tabPanelId}-archived-tab`}
              id={`${tabPanelId}-archived`}
              role="tabpanel"
            >
              <ArchivedSettingsPanel />
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
