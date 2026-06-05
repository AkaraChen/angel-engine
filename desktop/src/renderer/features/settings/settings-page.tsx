import type {
  AgentOption,
  AgentRuntime,
  AgentSettings,
  CreateCustomAgentInput,
  CustomAgent,
  UpdateCustomAgentInput,
} from "@shared/agents";
import type { KeyboardEvent, ReactNode } from "react";
import type { SupportedLanguage } from "@/i18n";
import type { DesktopThemeMode } from "@/platform/theme";
import claudeIconUrl from "@lobehub/icons-static-svg/icons/claudecode-color.svg";
import clineIconUrl from "@lobehub/icons-static-svg/icons/cline.svg";
import codexIconUrl from "@lobehub/icons-static-svg/icons/codex-color.svg";
import copilotIconUrl from "@lobehub/icons-static-svg/icons/copilot-color.svg";
import cursorIconUrl from "@lobehub/icons-static-svg/icons/cursor.svg";
import geminiIconUrl from "@lobehub/icons-static-svg/icons/geminicli-color.svg";
import kimiIconUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import opencodeIconUrl from "@lobehub/icons-static-svg/icons/opencode.svg";
import qoderIconUrl from "@lobehub/icons-static-svg/icons/qoder-color.svg";
import {
  RiErrorWarningLine as AlertTriangle,
  RiRobot2Line as Bot,
  RiPencilLine as Pencil,
  RiAddLine as Plus,
  RiSaveLine as Save,
  RiDeleteBinLine as Trash2,
  RiCloseLine as X,
} from "@remixicon/react";

import { isCustomAgentRuntime } from "@shared/agents";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArchivedSettingsPanel } from "@/features/settings/archived-settings-panel";
import { useSettingsStore } from "@/features/settings/settings-store";
import { useThemeSettings } from "@/features/settings/use-theme-settings";
import { languageOptions } from "@/i18n";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

type SettingsTab =
  | "agents"
  | "appearance"
  | "workspace"
  | "archived"
  | "danger";

const settingsTabs: Array<{ id: SettingsTab; labelKey: string }> = [
  { id: "agents", labelKey: "settings.tabs.agents" },
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "workspace", labelKey: "settings.tabs.workspace" },
  { id: "archived", labelKey: "settings.tabs.archived" },
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

const agentIconUrl: Partial<Record<AgentRuntime, string>> = {
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
  availableAgentOptions,
  isDeletingChats,
  onAgentEnabledChange,
  onDeleteAllChats,
}: {
  agentSettings: AgentSettings;
  availableAgentOptions: AgentOption[];
  isDeletingChats: boolean;
  onAgentEnabledChange: (runtime: AgentRuntime, enabled: boolean) => void;
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
  const builtinAgentOptions = availableAgentOptions.filter(
    (agent) => !isCustomAgentRuntime(agent.id),
  );
  const enabledRuntimeSet = new Set(agentSettings.enabledRuntimes);
  const visibleEnabledCount = availableAgentOptions.filter((agent) =>
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
          className={cn(
            "mx-auto flex w-full flex-col gap-5 px-8 pt-14 pb-8",
            activeTab === "archived" ? "max-w-4xl" : "max-w-2xl",
          )}
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
                  {builtinAgentOptions.map((agent) => {
                    const enabled = enabledRuntimeSet.has(agent.id);
                    const iconUrl = agentIconUrl[agent.id];
                    const isOnlyEnabled = enabled && visibleEnabledCount <= 1;

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
                            rounded-lg border border-foreground/10 bg-background
                          "
                        >
                          {iconUrl ? (
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
                      </SettingsRow>
                    );
                  })}
                </>
              </SettingsGroup>
              <CustomAgentsSettingsGroup
                customAgents={customAgents}
                enabledRuntimeSet={enabledRuntimeSet}
                visibleEnabledCount={visibleEnabledCount}
                onAgentEnabledChange={onAgentEnabledChange}
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

function CustomAgentsSettingsGroup({
  customAgents,
  enabledRuntimeSet,
  visibleEnabledCount,
  onAgentEnabledChange,
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

  return (
    <SettingsGroup title="Custom Agents">
      {customAgents.map((agent) => {
        const enabled = enabledRuntimeSet.has(agent.id);
        const isOnlyEnabled = enabled && visibleEnabledCount <= 1;

        return (
          <SettingsRow
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
            muted={!enabled}
          >
            <span
              className="
                flex size-9 shrink-0 items-center justify-center rounded-lg
                border border-foreground/10 bg-background
              "
            >
              <Bot className="size-5 text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {agent.label}
              </span>
              <span
                className="
                mt-0.5 block truncate text-xs text-muted-foreground
              "
              >
                {[agent.command, ...agent.args].join(" ")}
              </span>
            </span>
          </SettingsRow>
        );
      })}
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
  const [label, setLabel] = useState(agent?.label ?? "");
  const [command, setCommand] = useState(agent?.command ?? "");
  const [args, setArgs] = useState(agent?.args.join("\n") ?? "");
  const [environment, setEnvironment] = useState(
    agent?.environment.map((item) => `${item.name}=${item.value}`).join("\n") ??
      "",
  );
  const [needAuth, setNeedAuth] = useState(agent?.needAuth ?? false);
  const [autoAuthenticate, setAutoAuthenticate] = useState(
    agent?.autoAuthenticate ?? false,
  );
  const [saving, setSaving] = useState(false);
  const canSave = label.trim().length > 0 && command.trim().length > 0;
  const save = useCallback(async () => {
    setSaving(true);
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
      setSaving(false);
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
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Name
          <Input
            onChange={(event) => setLabel(event.currentTarget.value)}
            value={label}
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Command
          <Input
            onChange={(event) => setCommand(event.currentTarget.value)}
            placeholder="my-agent"
            value={command}
          />
        </label>
      </div>
      <label
        className="
        block space-y-1.5 text-xs font-medium text-muted-foreground
      "
      >
        Args
        <Textarea
          className="min-h-20 text-sm"
          onChange={(event) => setArgs(event.currentTarget.value)}
          placeholder={"acp\n--stdio"}
          value={args}
        />
      </label>
      <label
        className="
        block space-y-1.5 text-xs font-medium text-muted-foreground
      "
      >
        Environment
        <Textarea
          className="min-h-20 text-sm"
          onChange={(event) => setEnvironment(event.currentTarget.value)}
          placeholder={"API_KEY=value\nBASE_URL=https://example.com"}
          value={environment}
        />
      </label>
      <div className="flex items-center gap-5">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={needAuth} onCheckedChange={setNeedAuth} />
          Requires authentication
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={autoAuthenticate}
            onCheckedChange={setAutoAuthenticate}
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
