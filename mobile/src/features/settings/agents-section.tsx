import type { AgentOption } from "@angel-engine/daemon-api/agents";

import { Robot } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AgentReadinessLabel } from "@/features/settings/agent-readiness";
import { availableAgentListQueryOptions } from "@/features/settings/requests/management";
import { SettingsSection } from "@/features/settings/settings-section";
import { useDaemonClient } from "@/platform/daemon-provider";

/**
 * Catalog of built-in + custom agents with closed readiness status.
 * Enabled switches live on desktop settings; mobile surfaces readiness and
 * recovery so a missing binary is not silent after pairing.
 */
export function AgentsSection() {
  const { t } = useTranslation();
  const daemon = useDaemonClient();
  const agentsQuery = useQuery(availableAgentListQueryOptions({ daemon }));

  return (
    <SettingsSection
      description={t("settings.agents.description", {
        defaultValue:
          "Which coding agents the daemon can run. Ready is not the same as enabled.",
      })}
      title={t("settings.agents.title", { defaultValue: "Agents" })}
    >
      {agentsQuery.isPending ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : agentsQuery.isError ? (
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm text-muted-foreground">
            {t("settings.agents.loadError", {
              defaultValue: "Couldn't load agents.",
            })}
          </span>
          <Button
            className="h-11"
            onClick={() => void agentsQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("common.tryAgain")}
          </Button>
        </div>
      ) : agentsQuery.data.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {t("settings.agents.empty", {
            defaultValue: "No agents reported by the daemon.",
          })}
        </p>
      ) : (
        agentsQuery.data.map((agent) => (
          <AgentCatalogRow
            agent={agent}
            key={agent.id}
            onTestAgain={() => void agentsQuery.refetch()}
          />
        ))
      )}
    </SettingsSection>
  );
}

function AgentCatalogRow({
  agent,
  onTestAgain,
}: {
  agent: AgentOption;
  onTestAgain: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Robot className="size-5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {agent.label}
        </span>
        <AgentReadinessLabel
          agent={agent}
          className="mt-0.5"
          onTestAgain={onTestAgain}
        />
        {agent.description ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {agent.description}
          </span>
        ) : null}
      </span>
    </div>
  );
}
