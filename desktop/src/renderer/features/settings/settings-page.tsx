import type {
  AgentOption,
  AgentRuntime,
  AgentSettings,
} from "@angel-engine/daemon-api/agents";
import type { ReactNode, UIEvent } from "react";
import type { SettingsTab } from "@/features/settings/settings-tabs";
import type { SupportedLanguage } from "@/i18n";
import type { DesktopThemeMode } from "@/platform/theme";
import {
  isCustomAgentRuntime,
  sortAgentOptionsBySettings,
} from "@angel-engine/daemon-api/agents";
import { Trash as Trash2 } from "@phosphor-icons/react";

import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { useAgentCatalog } from "@/features/agents/agent-catalog-context";
import { useKeybindingHintsStore } from "@/features/keybindings/keybinding-hints-store";
import { KeyboardSettings } from "@/features/keybindings/keyboard-settings";
import { ArchivedSettingsPanel } from "@/features/settings/archived-settings-panel";
import { BuiltinAgentsSettingsGroup } from "@/features/settings/builtin-agent-settings";
import { CustomAgentsSettingsGroup } from "@/features/settings/custom-agent-settings";
import { MobileViewSettings } from "@/features/settings/mobile-view-settings";
import { SettingsNav } from "@/features/settings/settings-nav";
import {
  dangerActionClassName,
  SettingsGroup,
  SettingsRow,
  SettingsSelect,
} from "@/features/settings/settings-controls";
import { useSettingsStore } from "@/features/settings/settings-store";
import { findSettingsTab } from "@/features/settings/settings-tabs";
import { UpdateSettings } from "@/features/settings/update-settings";
import { UsageSettings } from "@/features/usage/usage-settings";
import { useSettingsTab } from "@/features/settings/use-settings-tab";
import { useThemeSettings } from "@/features/settings/use-theme-settings";
import { useTraySettings } from "@/features/settings/use-tray-settings";
import { languageOptions } from "@/i18n";
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

/** Scroll offset past which the page title condenses into the sticky bar. */
const CONDENSE_SCROLL_OFFSET = 36;

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
  const tabPanelId = useId();
  const [activeTab, setActiveTab] = useSettingsTab();
  const scrollRef = useRef<HTMLElement | null>(null);
  const [pageScroll, setPageScroll] = useState({
    condensed: false,
    scrolled: false,
  });

  const activeTabDefinition = findSettingsTab(activeTab);
  const activeTabLabel = t(activeTabDefinition.labelKey);

  const selectTab = useCallback(
    (tab: SettingsTab) => {
      setActiveTab(tab);
      scrollRef.current?.scrollTo({ top: 0 });
      setPageScroll({ condensed: false, scrolled: false });
    },
    [setActiveTab],
  );

  const handleScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const { scrollTop } = event.currentTarget;
    const next = {
      condensed: scrollTop > CONDENSE_SCROLL_OFFSET,
      scrolled: scrollTop > 2,
    };
    setPageScroll((current) =>
      current.condensed === next.condensed && current.scrolled === next.scrolled
        ? current
        : next,
    );
  }, []);

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <SettingsNav
        activeTab={activeTab}
        onActiveTabChange={selectTab}
        tabPanelId={tabPanelId}
      />

      <section
        className="min-w-0 flex-1 overflow-y-auto"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        <div
          className={cn(
            `
              sticky top-0 z-10 flex h-12 items-center border-b bg-background/80
              px-8 transition-colors
              supports-backdrop-filter:backdrop-blur-md
            `,
            pageScroll.scrolled ? "border-border-subtle" : "border-transparent",
          )}
          data-electron-drag
        >
          {pageScroll.condensed ? (
            <span
              className="
                truncate font-display text-sm font-semibold tracking-[-0.01em]
              "
            >
              {activeTabLabel}
            </span>
          ) : null}
        </div>

        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-6 px-8 pt-2 pb-14",
            activeTabDefinition.wide ? "max-w-4xl" : "max-w-2xl",
          )}
        >
          <header className="space-y-1.5">
            <h2 className="font-display text-lg font-semibold tracking-[-0.015em]">
              {activeTabLabel}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(activeTabDefinition.descriptionKey)}
            </p>
          </header>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="appearance"
            tabPanelId={tabPanelId}
          >
            <AppearanceSettings />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="keyboard"
            tabPanelId={tabPanelId}
          >
            <KeyboardSettings />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="workspace"
            tabPanelId={tabPanelId}
          >
            <WorkspaceSettings />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="agents"
            tabPanelId={tabPanelId}
          >
            <AgentsSettings
              agentSettings={agentSettings}
              availableAgentOptions={availableAgentOptions}
              onAgentEnabledChange={onAgentEnabledChange}
              onAgentOrderChange={onAgentOrderChange}
            />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="updates"
            tabPanelId={tabPanelId}
          >
            <UpdateSettings />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="usage"
            tabPanelId={tabPanelId}
          >
            <UsageSettings />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="mobile"
            tabPanelId={tabPanelId}
          >
            <MobileViewSettings />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="archived"
            tabPanelId={tabPanelId}
          >
            <ArchivedSettingsPanel />
          </SettingsTabPanel>

          <SettingsTabPanel
            activeTab={activeTab}
            tab="danger"
            tabPanelId={tabPanelId}
          >
            <DangerSettings
              isDeletingChats={isDeletingChats}
              onDeleteAllChats={onDeleteAllChats}
            />
          </SettingsTabPanel>
        </div>
      </section>
    </main>
  );
}

function SettingsTabPanel({
  activeTab,
  children,
  tab,
  tabPanelId,
}: {
  activeTab: SettingsTab;
  children: ReactNode;
  tab: SettingsTab;
  tabPanelId: string;
}) {
  if (activeTab !== tab) return null;

  return (
    <div
      aria-labelledby={`${tabPanelId}-${tab}-tab`}
      className="flex flex-col gap-6"
      id={`${tabPanelId}-${tab}`}
      role="tabpanel"
    >
      {children}
    </div>
  );
}

function AppearanceSettings() {
  const { t } = useTranslation();
  const [themeMode, setThemeMode] = useThemeSettings();
  const keybindingHintsEnabled = useKeybindingHintsStore(
    (state) => state.enabled,
  );
  const language = useSettingsStore((state) => state.language);
  const setKeybindingHintsEnabled = useKeybindingHintsStore(
    (state) => state.setEnabled,
  );
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  return (
    <SettingsGroup>
      <SettingsRow
        after={
          <SettingsSelect
            label={t("settings.appearance.theme")}
            onValueChange={(value) => setThemeMode(value as DesktopThemeMode)}
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
            onValueChange={(value) => setLanguage(value as SupportedLanguage)}
            options={languageOptions.map((option) => ({
              label: t(option.labelKey),
              value: option.value,
            }))}
            value={language}
          />
        }
        title={t("settings.appearance.language")}
      />
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.appearance.keybindingHintsSwitchLabel")}
            checked={keybindingHintsEnabled}
            onCheckedChange={setKeybindingHintsEnabled}
          />
        }
        description={t("settings.appearance.keybindingHintsDescription")}
        title={t("settings.appearance.keybindingHintsTitle")}
      />
    </SettingsGroup>
  );
}

function WorkspaceSettings() {
  const { t } = useTranslation();
  const sendWithModEnter = useSettingsStore((state) => state.sendWithModEnter);
  const setSendWithModEnter = useSettingsStore(
    (state) => state.setSendWithModEnter,
  );
  const worktreeDirtyPromptEnabled = useSettingsStore(
    (state) => state.worktreeDirtyPromptEnabled,
  );
  const setWorktreeDirtyPromptEnabled = useSettingsStore(
    (state) => state.setWorktreeDirtyPromptEnabled,
  );
  const { enabled: trayEnabled, setEnabled: setTrayEnabled } =
    useTraySettings();
  const modEnterShortcut =
    window.desktopEnvironment.platform === "darwin" ? "⌘+Enter" : "Ctrl+Enter";

  return (
    <SettingsGroup>
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.workspace.sendWithModEnterSwitchLabel", {
              shortcut: modEnterShortcut,
            })}
            checked={sendWithModEnter}
            onCheckedChange={setSendWithModEnter}
          />
        }
        description={t("settings.workspace.sendWithModEnterDescription", {
          shortcut: modEnterShortcut,
        })}
        title={t("settings.workspace.sendWithModEnterTitle", {
          shortcut: modEnterShortcut,
        })}
      />
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.workspace.dirtyPromptSwitchLabel")}
            checked={worktreeDirtyPromptEnabled}
            onCheckedChange={setWorktreeDirtyPromptEnabled}
          />
        }
        description={t("settings.workspace.dirtyPromptDescription")}
        title={t("settings.workspace.dirtyPromptTitle")}
      />
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.workspace.trayEnabledSwitchLabel")}
            checked={trayEnabled}
            onCheckedChange={(checked) => {
              void setTrayEnabled(checked);
            }}
          />
        }
        description={t("settings.workspace.trayEnabledDescription")}
        title={t("settings.workspace.trayEnabledTitle")}
      />
      <OsNotificationSettings />
    </SettingsGroup>
  );
}

export function OsNotificationSettings() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState({
    needsInput: true,
    osEnabled: true,
    runCompleted: true,
    sound: true,
  });
  // Mutations stay disabled until the authoritative main-process value loads;
  // a failed load is retryable rather than leaving dead controls.
  const [loadState, setLoadState] = useState<"failed" | "loading" | "ready">(
    "loading",
  );
  const [saveState, setSaveState] = useState<"idle" | "saved" | "failed">(
    "idle",
  );
  const loadRetryRef = useRef<() => void>(() => {});
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoadState("loading");
      void window.desktopWindow
        .getNotificationPreferences()
        .then((prefs) => {
          if (cancelled) return;
          setPreferences({
            needsInput: prefs.needsInput,
            osEnabled: prefs.osEnabled,
            runCompleted: prefs.runCompleted,
            sound: prefs.sound,
          });
          setLoadState("ready");
        })
        .catch(() => {
          if (!cancelled) setLoadState("failed");
        });
    };
    loadRetryRef.current = load;
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  const ready = loadState === "ready";

  const persist = async (
    patch: Partial<{
      needsInput: boolean;
      osEnabled: boolean;
      runCompleted: boolean;
      sound: boolean;
    }>,
  ) => {
    const previous = preferencesRef.current;
    const next = { ...previous, ...patch };
    preferencesRef.current = next;
    setPreferences(next);
    setSaveState("idle");
    try {
      const saved = await window.desktopWindow.setNotificationPreferences(next);
      const durable = {
        needsInput: saved.needsInput,
        osEnabled: saved.osEnabled,
        runCompleted: saved.runCompleted,
        sound: saved.sound,
      };
      preferencesRef.current = durable;
      setPreferences(durable);
      setSaveState("saved");
    } catch {
      // The write never landed: put the controls back on the durable value so
      // the UI cannot claim a preference the daemon does not have.
      preferencesRef.current = previous;
      setPreferences(previous);
      setSaveState("failed");
    }
  };

  return (
    <>
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.workspace.osNotificationsSwitchLabel")}
            checked={preferences.osEnabled}
            disabled={!ready}
            onCheckedChange={(checked) => {
              void persist({ osEnabled: checked });
            }}
          />
        }
        description={t("settings.workspace.osNotificationsDescription")}
        title={t("settings.workspace.osNotificationsTitle")}
      />
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.workspace.osNotificationsNeedsInputLabel")}
            checked={preferences.needsInput}
            disabled={!ready}
            onCheckedChange={(checked) => {
              void persist({ needsInput: checked });
            }}
          />
        }
        description={t(
          "settings.workspace.osNotificationsNeedsInputDescription",
        )}
        title={t("settings.workspace.osNotificationsNeedsInputLabel")}
      />
      <SettingsRow
        after={
          <Switch
            aria-label={t(
              "settings.workspace.osNotificationsRunCompletedLabel",
            )}
            checked={preferences.runCompleted}
            disabled={!ready}
            onCheckedChange={(checked) => {
              void persist({ runCompleted: checked });
            }}
          />
        }
        description={t(
          "settings.workspace.osNotificationsRunCompletedDescription",
        )}
        title={t("settings.workspace.osNotificationsRunCompletedLabel")}
      />
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.workspace.osNotificationsSoundLabel")}
            checked={preferences.sound}
            disabled={!ready}
            onCheckedChange={(checked) => {
              void persist({ sound: checked });
            }}
          />
        }
        description={t("settings.workspace.osNotificationsSoundDescription")}
        title={t("settings.workspace.osNotificationsSoundLabel")}
      />
      {saveState === "saved" ? (
        <p className="text-muted-foreground px-1 text-xs" role="status">
          {t("settings.workspace.osNotificationsSaved")}
        </p>
      ) : null}
      {saveState === "failed" ? (
        <p className="text-status-danger px-1 text-xs" role="alert">
          {t("settings.workspace.osNotificationsSaveFailed")}
        </p>
      ) : null}
      {loadState === "failed" ? (
        <div
          className="flex items-center justify-between gap-3 px-1"
          role="alert"
        >
          <p className="text-status-danger text-xs">
            {t("settings.workspace.osNotificationsLoadFailed")}
          </p>
          <Button
            onClick={() => loadRetryRef.current()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("settings.workspace.osNotificationsRetry")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function AgentsSettings({
  agentSettings,
  availableAgentOptions,
  onAgentEnabledChange,
  onAgentOrderChange,
}: {
  agentSettings: AgentSettings;
  availableAgentOptions: AgentOption[];
  onAgentEnabledChange: (runtime: AgentRuntime, enabled: boolean) => void;
  onAgentOrderChange: (orderedRuntimes: AgentRuntime[]) => void;
}) {
  const queryClient = useQueryClient();
  const { customAgents } = useAgentCatalog();
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
  const builtinAgentRuntimeOrder = builtinAgentOptions.map((agent) => agent.id);
  const customAgentRuntimeOrder = visibleCustomAgents.map((agent) => agent.id);
  const visibleEnabledCount = orderedAgentOptions.filter((agent) =>
    enabledRuntimeSet.has(agent.id),
  ).length;

  return (
    <>
      <BuiltinAgentsSettingsGroup
        agentOptions={builtinAgentOptions}
        customAgentRuntimeOrder={customAgentRuntimeOrder}
        enabledRuntimeSet={enabledRuntimeSet}
        onAgentEnabledChange={onAgentEnabledChange}
        onAgentOrderChange={onAgentOrderChange}
        visibleEnabledCount={visibleEnabledCount}
      />
      <CustomAgentsSettingsGroup
        availableAgentOptions={availableAgentOptions}
        customAgents={visibleCustomAgents}
        enabledRuntimeSet={enabledRuntimeSet}
        onAgentEnabledChange={onAgentEnabledChange}
        onAgentOrderChange={(orderedCustomRuntimes) =>
          onAgentOrderChange([
            ...builtinAgentRuntimeOrder,
            ...orderedCustomRuntimes,
          ])
        }
        onCreateCustomAgent={createCustomAgent}
        onDeleteCustomAgent={deleteCustomAgent}
        onDeleteCustomAgentImpact={deleteCustomAgentImpact}
        onDeletedCustomAgent={async () => {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.chats.all(),
          });
        }}
        onUpdateCustomAgent={updateCustomAgent}
        visibleEnabledCount={visibleEnabledCount}
      />
    </>
  );
}

function DangerSettings({
  isDeletingChats,
  onDeleteAllChats,
}: {
  isDeletingChats: boolean;
  onDeleteAllChats: () => Promise<void>;
}) {
  const { t } = useTranslation();

  const deleteAllChats = useCallback(async () => {
    const confirmed = await confirmAction({
      cancelLabel: t("common.cancel"),
      confirmLabel: t("common.delete"),
      description: t("settings.danger.description"),
      title: t("settings.danger.confirmDeleteAll"),
      tone: "danger",
    });
    if (!confirmed) return;

    await onDeleteAllChats();
  }, [onDeleteAllChats, t]);

  return (
    <SettingsGroup title={t("settings.danger.title")} tone="danger">
      <SettingsRow
        after={
          <Button
            className={dangerActionClassName}
            disabled={isDeletingChats}
            onClick={() => void deleteAllChats()}
            type="button"
            variant="destructive"
          >
            <Trash2 />
            {isDeletingChats
              ? t("settings.danger.deleting")
              : t("settings.danger.deleteAction")}
          </Button>
        }
        align="start"
        description={t("settings.danger.description")}
        title={t("settings.danger.deleteTitle")}
        variant="destructive"
      />
    </SettingsGroup>
  );
}
