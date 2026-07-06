import type { IconProps } from "@phosphor-icons/react";
import type {
  AgentOption,
  AgentRuntime,
  AgentSettings,
  CreateCustomAgentInput,
  CustomAgent,
  CustomAgentRuntime,
  UpdateCustomAgentInput,
} from "@shared/agents";
import type {
  ComponentType,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import type { SupportedLanguage } from "@/i18n";
import type { DesktopThemeMode } from "@/platform/theme";
import claudeIconUrl from "@lobehub/icons-static-svg/icons/claudecode-color.svg";
import clineIconUrl from "@lobehub/icons-static-svg/icons/cline.svg";
import codexIconUrl from "@lobehub/icons-static-svg/icons/codex-color.svg";
import copilotIconUrl from "@lobehub/icons-static-svg/icons/copilot-color.svg";
import geminiIconUrl from "@lobehub/icons-static-svg/icons/geminicli-color.svg";
import kimiIconUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import opencodeIconUrl from "@lobehub/icons-static-svg/icons/opencode.svg";
import qoderIconUrl from "@lobehub/icons-static-svg/icons/qoder-color.svg";
import {
  WarningCircle as AlertTriangle,
  Archive as ArchiveIcon,
  Robot as Bot,
  Monitor as ComputerIcon,
  DotsSixVertical as DragHandle,
  Palette as PaletteIcon,
  Pencil,
  Plus,
  FloppyDisk as Save,
  Trash as Trash2,
  X,
} from "@phosphor-icons/react";
import {
  isCustomAgentRuntime,
  sortAgentOptionsBySettings,
} from "@shared/agents";

import is from "@sindresorhus/is";
import { useQueryClient } from "@tanstack/react-query";
import { m, Reorder, useDragControls } from "framer-motion";
import { useCallback, useId, useMemo, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import piIconUrl from "@/features/agents/pi-coding-agent.svg";
import { ArchivedSettingsPanel } from "@/features/settings/archived-settings-panel";
import { useSettingsStore } from "@/features/settings/settings-store";
import { useThemeSettings } from "@/features/settings/use-theme-settings";
import { languageOptions } from "@/i18n";
import { springs } from "@/platform/motion";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

type SettingsTab =
  | "agents"
  | "appearance"
  | "workspace"
  | "archived"
  | "danger";

const settingsTabs: Array<{
  icon: ComponentType<Pick<IconProps, "className" | "weight">>;
  id: SettingsTab;
  labelKey: string;
}> = [
  { icon: Bot, id: "agents", labelKey: "settings.tabs.agents" },
  { icon: PaletteIcon, id: "appearance", labelKey: "settings.tabs.appearance" },
  { icon: ComputerIcon, id: "workspace", labelKey: "settings.tabs.workspace" },
  { icon: ArchiveIcon, id: "archived", labelKey: "settings.tabs.archived" },
  { icon: AlertTriangle, id: "danger", labelKey: "settings.tabs.danger" },
];

const themeModeOptions: Array<{
  labelKey: string;
  value: DesktopThemeMode;
}> = [
  { labelKey: "settings.appearance.themeOptions.system", value: "system" },
  { labelKey: "settings.appearance.themeOptions.light", value: "light" },
  { labelKey: "settings.appearance.themeOptions.dark", value: "dark" },
];

const agentIconUrl: Partial<Record<AgentRuntime, string>> = {
  claude: claudeIconUrl,
  cline: clineIconUrl,
  codex: codexIconUrl,
  copilot: copilotIconUrl,
  gemini: geminiIconUrl,
  kimi: kimiIconUrl,
  opencode: opencodeIconUrl,
  pi: piIconUrl,
  qoder: qoderIconUrl,
};

interface CustomAgentFormState {
  args: string;
  autoAuthenticate: boolean;
  command: string;
  environment: string;
  label: string;
  needAuth: boolean;
  saving: boolean;
}

type CustomAgentFormAction =
  | {
      field: Exclude<keyof CustomAgentFormState, "saving">;
      type: "field";
      value: boolean | string;
    }
  | { saving: boolean; type: "saving" };

function createCustomAgentFormState(
  agent: CustomAgent | null,
): CustomAgentFormState {
  return {
    args: agent?.args.join("\n") ?? "",
    autoAuthenticate: agent?.autoAuthenticate ?? false,
    command: agent?.command ?? "",
    environment:
      agent?.environment
        .map((item) => `${item.name}=${item.value}`)
        .join("\n") ?? "",
    label: agent?.label ?? "",
    needAuth: agent?.needAuth ?? false,
    saving: false,
  };
}

function customAgentFormReducer(
  state: CustomAgentFormState,
  action: CustomAgentFormAction,
): CustomAgentFormState {
  switch (action.type) {
    case "field":
      return { ...state, [action.field]: action.value };
    case "saving":
      return { ...state, saving: action.saving };
  }
}

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
  const [builtinAgentOrderPreview, setBuiltinAgentOrderPreview] = useState<
    AgentRuntime[] | null
  >(null);
  const builtinAgentOptionById = new Map(
    builtinAgentOptions.map((agent) => [agent.id, agent]),
  );
  const displayedBuiltinAgentOptions = builtinAgentOrderPreview
    ? builtinAgentOrderPreview.flatMap((runtime) => {
        const agent = builtinAgentOptionById.get(runtime);
        return agent ? [agent] : [];
      })
    : builtinAgentOptions;
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
              <SettingsGroup>
                <Reorder.Group
                  as="div"
                  axis="y"
                  className="divide-y divide-border"
                  onReorder={setBuiltinAgentOrderPreview}
                  values={displayedBuiltinAgentOptions.map((agent) => agent.id)}
                >
                  {displayedBuiltinAgentOptions.map((agent) => {
                    const enabled = enabledRuntimeSet.has(agent.id);
                    const iconUrl = agentIconUrl[agent.id];
                    const isOnlyEnabled = enabled && visibleEnabledCount <= 1;

                    return (
                      <ReorderableAgentRow
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
                        label={agent.label}
                        muted={!enabled}
                        onOrderCommit={() => {
                          if (builtinAgentOrderPreview) {
                            onAgentOrderChange([
                              ...builtinAgentOrderPreview,
                              ...customAgentRuntimeOrder,
                            ]);
                          }
                          setBuiltinAgentOrderPreview(null);
                        }}
                        runtime={agent.id}
                      >
                        <span
                          className="
                            flex size-9 shrink-0 items-center justify-center
                            rounded-lg border border-border bg-background
                          "
                        >
                          {is.nonEmptyString(iconUrl) ? (
                            <img
                              alt=""
                              className="size-5 object-contain"
                              draggable={false}
                              src={iconUrl}
                            />
                          ) : (
                            <Bot className="size-5 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {agent.label}
                          </span>
                        </span>
                      </ReorderableAgentRow>
                    );
                  })}
                </Reorder.Group>
              </SettingsGroup>
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

function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="space-y-2">
      {is.nonEmptyString(title) ? (
        <h3 className="text-sm font-semibold">{title}</h3>
      ) : null}
      <div
        className="
          divide-y divide-border-subtle overflow-hidden rounded-xl border
          border-border-subtle bg-surface-1/50 shadow-xs
        "
      >
        {children}
      </div>
    </section>
  );
}

function CustomAgentsSettingsGroup({
  customAgents,
  enabledRuntimeSet,
  visibleEnabledCount,
  onAgentEnabledChange,
  onAgentOrderChange,
  onCreateCustomAgent,
  onDeleteCustomAgent,
  onDeletedCustomAgent,
  onDeleteCustomAgentImpact,
  onUpdateCustomAgent,
}: {
  customAgents: CustomAgent[];
  enabledRuntimeSet: Set<AgentRuntime>;
  visibleEnabledCount: number;
  onAgentEnabledChange: (runtime: AgentRuntime, enabled: boolean) => void;
  onAgentOrderChange: (orderedRuntimes: AgentRuntime[]) => void;
  onCreateCustomAgent: (input: CreateCustomAgentInput) => Promise<CustomAgent>;
  onDeleteCustomAgent: (runtime: AgentRuntime) => Promise<void>;
  onDeletedCustomAgent: () => Promise<void>;
  onDeleteCustomAgentImpact: (
    runtime: AgentRuntime,
  ) => Promise<{ chatCount: number }>;
  onUpdateCustomAgent: (input: UpdateCustomAgentInput) => Promise<CustomAgent>;
}) {
  const [editingAgent, setEditingAgent] = useState<CustomAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const deleteAgent = useCallback(
    async (agent: CustomAgent) => {
      const impact = await onDeleteCustomAgentImpact(agent.id);
      const confirmed = await window.desktopWindow.confirmDeleteCustomAgent({
        chatCount: impact.chatCount,
        label: agent.label,
      });
      if (!confirmed) return;

      await onDeleteCustomAgent(agent.id);
      await onDeletedCustomAgent();
    },
    [onDeleteCustomAgent, onDeletedCustomAgent, onDeleteCustomAgentImpact],
  );

  const [orderPreview, setOrderPreview] = useState<CustomAgentRuntime[] | null>(
    null,
  );
  const customAgentById = new Map(
    customAgents.map((agent) => [agent.id, agent]),
  );
  const displayedCustomAgents = orderPreview
    ? orderPreview.flatMap((runtime) => {
        const agent = customAgentById.get(runtime);
        return agent ? [agent] : [];
      })
    : customAgents;

  return (
    <SettingsGroup title="Custom Agents">
      <Reorder.Group
        as="div"
        axis="y"
        className="divide-y divide-border"
        onReorder={setOrderPreview}
        values={displayedCustomAgents.map((agent) => agent.id)}
      >
        {displayedCustomAgents.map((agent) => {
          const enabled = enabledRuntimeSet.has(agent.id);
          const isOnlyEnabled = enabled && visibleEnabledCount <= 1;

          return (
            <ReorderableAgentRow
              after={
                <div className="flex items-center gap-1.5">
                  <AgentEnabledSwitch
                    checked={enabled}
                    disabled={isOnlyEnabled}
                    label={`Enable ${agent.label}`}
                    onCheckedChange={(checked) =>
                      onAgentEnabledChange(agent.id, checked)
                    }
                  />
                  <Button
                    aria-label={`Edit ${agent.label}`}
                    onClick={() => setEditingAgent(agent)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    aria-label={`Delete ${agent.label}`}
                    onClick={() => void deleteAgent(agent)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
              }
              key={agent.id}
              label={agent.label}
              muted={!enabled}
              onOrderCommit={() => {
                if (orderPreview) onAgentOrderChange(orderPreview);
                setOrderPreview(null);
              }}
              runtime={agent.id}
            >
              <span
                className="
                  flex size-9 shrink-0 items-center justify-center rounded-lg
                  border border-border bg-background
                "
              >
                <Bot className="size-5 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {agent.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-xs text-muted-foreground",
                  )}
                >
                  {[agent.command, ...agent.args].join(" ")}
                </span>
              </span>
            </ReorderableAgentRow>
          );
        })}
      </Reorder.Group>
      {creating || editingAgent ? (
        <CustomAgentForm
          agent={editingAgent}
          onCancel={() => {
            setCreating(false);
            setEditingAgent(null);
          }}
          onCreate={async (input) => {
            await onCreateCustomAgent(input);
            setCreating(false);
          }}
          onUpdate={async (input) => {
            await onUpdateCustomAgent(input);
            setEditingAgent(null);
          }}
        />
      ) : (
        <article className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            Custom ACP agents store environment variables locally in plain text.
          </span>
          <Button
            onClick={() => setCreating(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus />
            Add Agent
          </Button>
        </article>
      )}
    </SettingsGroup>
  );
}

function CustomAgentForm({
  agent,
  onCancel,
  onCreate,
  onUpdate,
}: {
  agent: CustomAgent | null;
  onCancel: () => void;
  onCreate: (input: CreateCustomAgentInput) => Promise<void>;
  onUpdate: (input: UpdateCustomAgentInput) => Promise<void>;
}) {
  const formId = useId();
  const [formState, dispatchForm] = useReducer(
    customAgentFormReducer,
    agent,
    createCustomAgentFormState,
  );
  const {
    args,
    autoAuthenticate,
    command,
    environment,
    label,
    needAuth,
    saving,
  } = formState;
  const canSave = label.trim().length > 0 && command.trim().length > 0;
  const save = useCallback(async () => {
    dispatchForm({ saving: true, type: "saving" });
    const input = {
      args: argsToList(args),
      autoAuthenticate,
      command,
      environment: environmentToList(environment),
      label,
      needAuth,
    };
    try {
      if (agent) {
        await onUpdate({ ...input, id: agent.id });
      } else {
        await onCreate(input);
      }
    } finally {
      dispatchForm({ saving: false, type: "saving" });
    }
  }, [
    agent,
    args,
    autoAuthenticate,
    command,
    environment,
    label,
    needAuth,
    onCreate,
    onUpdate,
  ]);

  return (
    <article className="space-y-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-3">
        <label
          className="space-y-1.5 text-xs font-medium text-muted-foreground"
          htmlFor={`${formId}-name`}
        >
          Name
          <Input
            id={`${formId}-name`}
            onChange={(event) =>
              dispatchForm({
                field: "label",
                type: "field",
                value: event.currentTarget.value,
              })
            }
            value={label}
          />
        </label>
        <label
          className="space-y-1.5 text-xs font-medium text-muted-foreground"
          htmlFor={`${formId}-command`}
        >
          Command
          <Input
            id={`${formId}-command`}
            onChange={(event) =>
              dispatchForm({
                field: "command",
                type: "field",
                value: event.currentTarget.value,
              })
            }
            placeholder="my-agent"
            value={command}
          />
        </label>
      </div>
      <label
        className="block space-y-1.5 text-xs font-medium text-muted-foreground"
        htmlFor={`${formId}-args`}
      >
        Args
        <Textarea
          className="min-h-20 text-sm"
          id={`${formId}-args`}
          onChange={(event) =>
            dispatchForm({
              field: "args",
              type: "field",
              value: event.currentTarget.value,
            })
          }
          placeholder={"acp\n--stdio"}
          value={args}
        />
      </label>
      <label
        className="block space-y-1.5 text-xs font-medium text-muted-foreground"
        htmlFor={`${formId}-environment`}
      >
        Environment
        <Textarea
          className="min-h-20 text-sm"
          id={`${formId}-environment`}
          onChange={(event) =>
            dispatchForm({
              field: "environment",
              type: "field",
              value: event.currentTarget.value,
            })
          }
          placeholder={"API_KEY=value\nBASE_URL=https://example.com"}
          value={environment}
        />
      </label>
      <div className="flex items-center gap-5">
        <label
          className="flex items-center gap-2 text-sm"
          htmlFor={`${formId}-need-auth`}
        >
          <Switch
            checked={needAuth}
            id={`${formId}-need-auth`}
            onCheckedChange={(checked) =>
              dispatchForm({
                field: "needAuth",
                type: "field",
                value: checked,
              })
            }
          />
          Requires authentication
        </label>
        <label
          className="flex items-center gap-2 text-sm"
          htmlFor={`${formId}-auto-authenticate`}
        >
          <Switch
            checked={autoAuthenticate}
            id={`${formId}-auto-authenticate`}
            onCheckedChange={(checked) =>
              dispatchForm({
                field: "autoAuthenticate",
                type: "field",
                value: checked,
              })
            }
          />
          Auto authenticate
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          disabled={saving}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X />
          Cancel
        </Button>
        <Button
          disabled={!canSave || saving}
          onClick={() => void save()}
          size="sm"
          type="button"
        >
          <Save />
          Save
        </Button>
      </div>
    </article>
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
        "flex min-h-12 items-center gap-3 bg-card px-4 py-3",
        muted && "text-muted-foreground",
      )}
    >
      {!is.falsy(icon) ? (
        <span
          className="
            flex size-8 shrink-0 items-center justify-center rounded-md border
            border-border bg-background
          "
        >
          {icon}
        </span>
      ) : null}
      {!is.falsy(children) ? (
        children
      ) : (
        <span className="min-w-0 flex-1">
          {is.nonEmptyString(title) ? (
            <span
              className={cn(
                "block text-sm font-medium",
                variant === "destructive" && "text-destructive",
              )}
            >
              {title}
            </span>
          ) : null}
          {is.nonEmptyString(description) ? (
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

function argsToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function environmentToList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) {
        return { name: line.trim(), value: "" };
      }
      return {
        name: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1),
      };
    })
    .filter((item) => item.name.length > 0);
}

function AgentOrderHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      aria-label={`Reorder ${label}`}
      className="
        shrink-0 cursor-grab touch-none text-muted-foreground
        active:cursor-grabbing
      "
      onPointerDown={onPointerDown}
      size="icon-xs"
      title={`Reorder ${label}`}
      type="button"
      variant="ghost"
    >
      <DragHandle />
    </Button>
  );
}

function ReorderableAgentRow({
  after,
  children,
  label,
  muted,
  onOrderCommit,
  runtime,
}: {
  after: ReactNode;
  children: ReactNode;
  label: string;
  muted?: boolean;
  onOrderCommit: () => void;
  runtime: AgentRuntime;
}) {
  const dragControls = useDragControls();
  const [dragging, setDragging] = useState(false);

  return (
    <Reorder.Item
      as="article"
      className={cn(
        "flex min-h-12 items-center gap-3 bg-card px-4 py-3",
        dragging &&
          "relative z-10 rounded-lg shadow-lg ring-1 ring-foreground/10",
        muted && "text-muted-foreground",
      )}
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={() => {
        setDragging(false);
        onOrderCommit();
      }}
      onDragStart={() => setDragging(true)}
      value={runtime}
    >
      <AgentOrderHandle
        label={label}
        onPointerDown={(event) => {
          event.preventDefault();
          dragControls.start(event);
        }}
      />
      {children}
      <span className="ml-auto shrink-0">{after}</span>
    </Reorder.Item>
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
