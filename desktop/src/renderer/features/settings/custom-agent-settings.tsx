"use client";

import type {
  AgentOption,
  AgentRuntime,
  CreateCustomAgentInput,
  CustomAgent,
  CustomAgentRuntime,
  UpdateCustomAgentInput,
} from "@angel-engine/daemon-api/agents";

import {
  Robot as Bot,
  Pencil,
  Plus,
  FloppyDisk as Save,
  Trash as Trash2,
  X,
} from "@phosphor-icons/react";
import { Reorder } from "framer-motion";
import { useCallback, useId, useMemo, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AgentReadinessBadge } from "@/features/settings/agent-readiness";
import {
  AgentEnabledSwitch,
  ReorderableAgentRow,
  SettingsGroup,
} from "@/features/settings/settings-controls";

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

function CustomAgentsSettingsGroup({
  availableAgentOptions,
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
  availableAgentOptions: AgentOption[];
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
  const { t } = useTranslation();
  const [editingAgent, setEditingAgent] = useState<CustomAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const readinessById = useMemo(() => {
    const map = new Map<string, AgentOption>();
    for (const option of availableAgentOptions) {
      map.set(option.id, option);
    }
    return map;
  }, [availableAgentOptions]);
  const deleteAgent = useCallback(
    async (agent: CustomAgent) => {
      const impact = await onDeleteCustomAgentImpact(agent.id);
      const confirmed = await confirmAction({
        cancelLabel: t("common.cancel"),
        confirmLabel: t("common.delete"),
        description:
          impact.chatCount > 0
            ? t("dialog.confirm.deleteCustomAgentDetail", {
                count: impact.chatCount,
              })
            : t("dialog.confirm.deleteCustomAgentDetailNone"),
        title: t("dialog.confirm.deleteCustomAgentTitle", {
          label: agent.label,
        }),
        tone: "danger",
      });
      if (!confirmed) return;

      await onDeleteCustomAgent(agent.id);
      await onDeletedCustomAgent();
    },
    [onDeleteCustomAgent, onDeletedCustomAgent, onDeleteCustomAgentImpact, t],
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
    <SettingsGroup title={t("settings.customAgents.title")}>
      <Reorder.Group
        as="div"
        axis="y"
        className="divide-y divide-border-subtle"
        onReorder={setOrderPreview}
        values={displayedCustomAgents.map((agent) => agent.id)}
      >
        {displayedCustomAgents.map((agent) => {
          const enabled = enabledRuntimeSet.has(agent.id);
          const isOnlyEnabled = enabled && visibleEnabledCount <= 1;
          const catalogOption = readinessById.get(agent.id) ?? {
            description: `${agent.command} ${agent.args.join(" ")}`.trim(),
            id: agent.id,
            label: agent.label,
            readiness: agent.needAuth
              ? { status: "authentication-required" as const }
              : { status: "checking" as const },
          };

          return (
            <ReorderableAgentRow
              after={
                <div className="flex items-center gap-1.5">
                  <AgentEnabledSwitch
                    checked={enabled}
                    disabled={isOnlyEnabled}
                    label={t("settings.customAgents.enableAgent", {
                      label: agent.label,
                    })}
                    onCheckedChange={(checked) =>
                      onAgentEnabledChange(agent.id, checked)
                    }
                  />
                  <Button
                    aria-label={t("settings.customAgents.editAgent", {
                      label: agent.label,
                    })}
                    onClick={() => setEditingAgent(agent)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    aria-label={t("settings.customAgents.deleteAgent", {
                      label: agent.label,
                    })}
                    onClick={() => void deleteAgent(agent)}
                    size="icon-xs"
                    type="button"
                    variant="destructive"
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
                  flex size-8 shrink-0 items-center justify-center rounded-lg
                  border border-border-subtle bg-background
                "
              >
                <Bot className="size-4 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {agent.label}
                </span>
                <AgentReadinessBadge agent={catalogOption} className="mt-0.5" />
                <span
                  className="
                    mt-0.5 block truncate font-mono text-[0.6875rem]
                    text-muted-foreground
                  "
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
        <article className="flex items-center justify-between gap-3 px-5 py-3.5">
          <span className="text-sm text-muted-foreground">
            {t("settings.customAgents.plainTextNotice")}
          </span>
          <Button
            onClick={() => setCreating(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus />
            {t("settings.customAgents.addAgent")}
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
  const { t } = useTranslation();
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
  const isDirty = agent
    ? label !== agent.label ||
      command !== agent.command ||
      args !== agent.args.join("\n") ||
      needAuth !== agent.needAuth ||
      autoAuthenticate !== agent.autoAuthenticate ||
      environment !==
        agent.environment
          .map((entry) => `${entry.name}=${entry.value}`)
          .join("\n")
    : label.trim().length > 0 || command.trim().length > 0;
  const canSave =
    isDirty && label.trim().length > 0 && command.trim().length > 0;
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
    <article className="space-y-3.5 px-5 py-4">
      <div className="grid grid-cols-2 gap-3">
        <label
          className="space-y-1.5 text-xs font-medium text-muted-foreground"
          htmlFor={`${formId}-name`}
        >
          {t("settings.customAgents.form.name")}
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
          {t("settings.customAgents.form.command")}
          <Input
            className="font-mono text-sm"
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
        {t("settings.customAgents.form.args")}
        <Textarea
          className="min-h-20 font-mono text-sm"
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
        {t("settings.customAgents.form.environment")}
        <Textarea
          className="min-h-20 font-mono text-sm"
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
          {t("settings.customAgents.form.requiresAuth")}
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
          {t("settings.customAgents.form.autoAuthenticate")}
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
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!canSave || saving}
          onClick={() => void save()}
          size="sm"
          type="button"
        >
          <Save />
          {t("common.save")}
        </Button>
      </div>
    </article>
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

export { CustomAgentsSettingsGroup };
