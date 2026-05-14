import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle, Bot, Trash2 } from "lucide-react";
import claudeIconUrl from "@lobehub/icons-static-svg/icons/claudecode-color.svg";
import clineIconUrl from "@lobehub/icons-static-svg/icons/cline.svg";
import codexIconUrl from "@lobehub/icons-static-svg/icons/codex-color.svg";
import copilotIconUrl from "@lobehub/icons-static-svg/icons/copilot-color.svg";
import cursorIconUrl from "@lobehub/icons-static-svg/icons/cursor.svg";
import geminiIconUrl from "@lobehub/icons-static-svg/icons/geminicli-color.svg";
import kimiIconUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import opencodeIconUrl from "@lobehub/icons-static-svg/icons/opencode.svg";
import qoderIconUrl from "@lobehub/icons-static-svg/icons/qoder-color.svg";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/platform/utils";
import {
  AGENT_OPTIONS,
  getEnabledAgentOptions,
  type AgentRuntime,
  type AgentSettings,
} from "@/shared/agents";

type SettingsTab = "agents" | "danger";

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "agents", label: "Agents" },
  { id: "danger", label: "Danger Area" },
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
  const [activeTab, setActiveTab] = useState<SettingsTab>("agents");
  const enabledAgentOptions = getEnabledAgentOptions(agentSettings);
  const enabledRuntimeSet = new Set(agentSettings.enabledRuntimes);

  const deleteAllChats = useCallback(async () => {
    const confirmed = window.confirm(
      "Delete all chats? This cannot be undone.",
    );
    if (!confirmed) return;

    await onDeleteAllChats();
  }, [onDeleteAllChats]);

  return (
    <main className="flex min-h-0 flex-1 overflow-auto">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure desktop workspace behavior.
          </p>
        </div>

        <div className="flex gap-2 border-b">
          {settingsTabs.map((tab) => (
            <button
              className={cn(
                "border-b-2 px-1 pb-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent",
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "agents" ? (
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Agents</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {AGENT_OPTIONS.map((agent) => {
                  const enabled = enabledRuntimeSet.has(agent.id);
                  const isOnlyEnabled =
                    enabled && agentSettings.enabledRuntimes.length <= 1;

                  return (
                    <article
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
                        enabled
                          ? "border-foreground/10"
                          : "border-foreground/10 bg-card/45 text-muted-foreground",
                      )}
                      key={agent.id}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-background">
                        <img
                          alt=""
                          className="size-5 object-contain"
                          draggable={false}
                          src={agentIconUrl[agent.id]}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {agent.label}
                        </span>
                      </span>
                      <AgentEnabledSwitch
                        checked={enabled}
                        disabled={isOnlyEnabled}
                        label={`${agent.label} agent`}
                        onCheckedChange={(checked) =>
                          onAgentEnabledChange(agent.id, checked)
                        }
                      />
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Default agent</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Used for new chats started from the composer or project
                    list.
                  </p>
                </div>
                <SettingsSelect
                  icon={<Bot />}
                  label="Default agent"
                  onValueChange={(value) =>
                    onDefaultAgentChange(value as AgentRuntime)
                  }
                  options={enabledAgentOptions.map((agent) => ({
                    label: agent.label,
                    value: agent.id,
                  }))}
                  value={agentSettings.defaultRuntime}
                />
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "danger" ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-destructive">
                  Delete all chats
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Removes every chat from the local desktop database and closes
                  active chat sessions.
                </p>
              </div>
              <Button
                disabled={isDeletingChats}
                onClick={() => void deleteAllChats()}
                type="button"
                variant="destructive"
              >
                <Trash2 />
                {isDeletingChats ? "Deleting" : "Delete all chats"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SettingsSelect({
  icon,
  label,
  onValueChange,
  options,
  value,
}: {
  icon: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="flex min-w-44 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger
          aria-label={label}
          className="h-8 w-full rounded-xl border-border bg-background px-2 text-xs"
          size="sm"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
              {icon}
            </span>
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent className="rounded-2xl">
          {options.map((option) => (
            <SelectItem
              className="rounded-lg"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
  return (
    <Switch
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      title={disabled ? "At least one agent must stay enabled." : label}
    />
  );
}
