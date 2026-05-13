import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle, Bot, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/platform/utils";
import {
  AGENT_OPTIONS,
  type AgentRuntime,
  type AgentSettings,
} from "@/shared/agents";

type SettingsTab = "agents" | "danger";

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "agents", label: "Agents" },
  { id: "danger", label: "Danger Area" },
];

export function SettingsPage({
  agentSettings,
  isDeletingChats,
  onDeleteAllChats,
  onDefaultAgentChange,
}: {
  agentSettings: AgentSettings;
  isDeletingChats: boolean;
  onDeleteAllChats: () => Promise<void>;
  onDefaultAgentChange: (runtime: AgentRuntime) => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("agents");

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
          <div className="space-y-4">
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
                  options={AGENT_OPTIONS.map((agent) => ({
                    label: agent.label,
                    value: agent.id,
                  }))}
                  value={agentSettings.defaultRuntime}
                />
              </div>
            </section>

            <div className="grid gap-3">
              {AGENT_OPTIONS.map((agent) => (
                <section
                  className="rounded-2xl border bg-card p-4"
                  key={agent.id}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Bot className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">{agent.label}</h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                </section>
              ))}
            </div>
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
      {label}
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger
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
