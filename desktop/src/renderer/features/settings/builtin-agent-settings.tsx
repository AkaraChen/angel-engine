"use client";

import type {
  AgentOption,
  AgentRuntime,
} from "@angel-engine/daemon-api/agents";

import claudeIconUrl from "@lobehub/icons-static-svg/icons/claudecode-color.svg";
import clineIconUrl from "@lobehub/icons-static-svg/icons/cline.svg";
import codexIconUrl from "@lobehub/icons-static-svg/icons/codex-color.svg";
import copilotIconUrl from "@lobehub/icons-static-svg/icons/copilot-color.svg";
import geminiIconUrl from "@lobehub/icons-static-svg/icons/geminicli-color.svg";
import kimiIconUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import opencodeIconUrl from "@lobehub/icons-static-svg/icons/opencode.svg";
import qoderIconUrl from "@lobehub/icons-static-svg/icons/qoder-color.svg";
import { Robot as Bot } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { Reorder } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import piIconUrl from "@/features/agents/pi-coding-agent.svg";
import {
  AgentEnabledSwitch,
  ReorderableAgentRow,
  SettingsGroup,
} from "@/features/settings/settings-controls";

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

function BuiltinAgentsSettingsGroup({
  agentOptions,
  customAgentRuntimeOrder,
  enabledRuntimeSet,
  visibleEnabledCount,
  onAgentEnabledChange,
  onAgentOrderChange,
}: {
  agentOptions: AgentOption[];
  customAgentRuntimeOrder: AgentRuntime[];
  enabledRuntimeSet: Set<AgentRuntime>;
  visibleEnabledCount: number;
  onAgentEnabledChange: (runtime: AgentRuntime, enabled: boolean) => void;
  onAgentOrderChange: (orderedRuntimes: AgentRuntime[]) => void;
}) {
  const { t } = useTranslation();
  const [builtinAgentOrderPreview, setBuiltinAgentOrderPreview] = useState<
    AgentRuntime[] | null
  >(null);
  const builtinAgentOptionById = new Map(
    agentOptions.map((agent) => [agent.id, agent]),
  );
  const displayedBuiltinAgentOptions = builtinAgentOrderPreview
    ? builtinAgentOrderPreview.flatMap((runtime) => {
        const agent = builtinAgentOptionById.get(runtime);
        return agent ? [agent] : [];
      })
    : agentOptions;

  return (
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
                  flex size-9 shrink-0 items-center justify-center rounded-lg
                  border border-border bg-background
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
  );
}

export { BuiltinAgentsSettingsGroup };
