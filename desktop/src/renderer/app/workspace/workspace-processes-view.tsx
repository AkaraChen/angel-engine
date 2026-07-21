import type { FC, ReactNode } from "react";

import { ArrowSquareOut, Stop } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDaemonClient } from "@/platform/daemon";
import {
  killProcessMutationOptions,
  processRegistryQueryOptions,
} from "./requests/processes";
import { useWorkspaceToolStore } from "./workspace-tool-store";

interface WorkspaceProcessesViewProps {
  active: boolean;
  onOpenBrowser: (url: string) => void;
}

const COMMON_PORT_SERVICES: Readonly<Record<number, string>> = {
  3000: "Web app",
  3306: "MySQL",
  4173: "Vite preview",
  5173: "Vite",
  5432: "PostgreSQL",
  6379: "Redis",
  8000: "Web server",
  8080: "Web server",
  8787: "Wrangler",
  9229: "Node inspector",
  27017: "MongoDB",
};

export const WorkspaceProcessesView: FC<WorkspaceProcessesViewProps> = ({
  active,
  onOpenBrowser,
}) => {
  const client = useDaemonClient();
  const chatId = useWorkspaceToolStore((state) => state.context.chatId);
  const queryClient = useQueryClient();
  const registryQuery = useQuery(
    processRegistryQueryOptions({ client, enabled: active }),
  );
  const killMutation = useMutation(
    client === null
      ? { mutationFn: async () => undefined }
      : killProcessMutationOptions({ chatId, client, queryClient }),
  );

  if (client === null) return <PanelMessage message="Backend unavailable" />;
  if (registryQuery.isError)
    return <PanelMessage message={registryQuery.error.message} />;
  if (registryQuery.data === undefined)
    return <PanelMessage message="Loading processes…" />;

  const entries = registryQuery.data.entries.filter(
    (entry) => entry.id === chatId,
  );
  const processCount = entries.reduce(
    (count, entry) => count + entry.processes.length,
    0,
  );
  const portCount = entries.reduce(
    (count, entry) => count + entry.ports.length,
    0,
  );
  if (processCount === 0 && portCount === 0) {
    return <PanelMessage message="No agent subprocesses running" />;
  }

  const kill = (pid: number, name: string) => {
    // The process inspector is already a desktop-only privileged surface.
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Kill ${name} (${pid})?`)) return;
    killMutation.mutate({ pid });
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-2">
      <section className="min-h-0 overflow-auto p-3">
        <h2 className="mb-2 text-xs font-semibold text-muted-foreground">
          Subprocesses
        </h2>
        <div className="space-y-1">
          {entries.flatMap((entry) =>
            entry.processes.map((process) => (
              <ProcessRow
                detail={`${process.pid} · ${process.command.join(" ")}`}
                key={`${entry.id}-${process.pid}`}
                name={process.name}
                action={
                  <Button
                    aria-label={`Kill ${process.name}`}
                    className="
                      text-destructive
                      hover:text-destructive
                    "
                    size="icon-sm"
                    title={`Kill ${process.name}`}
                    variant="ghost"
                    onClick={() => kill(process.pid, process.name)}
                  >
                    <Stop weight="regular" />
                  </Button>
                }
              />
            )),
          )}
        </div>
      </section>
      <section className="min-h-0 overflow-auto p-3">
        <h2 className="mb-2 text-xs font-semibold text-muted-foreground">
          Listening ports
        </h2>
        <div className="space-y-1">
          {entries.flatMap((entry) =>
            entry.ports.map((port) => {
              const process = entry.processes.find(
                (item) => item.pid === port.pid,
              );
              const name = process?.name ?? entry.label;
              return (
                <ProcessRow
                  detail={`${port.address}:${port.port} — ${name} (${port.pid})`}
                  key={`${entry.id}-${port.pid}-${port.address}-${port.port}`}
                  name={`Port ${port.port}`}
                  service={COMMON_PORT_SERVICES[port.port]}
                  action={
                    <Button
                      aria-label={`Open port ${port.port} in browser tab`}
                      size="icon-sm"
                      title={`Open port ${port.port} in browser tab`}
                      variant="ghost"
                      onClick={() =>
                        onOpenBrowser(`http://localhost:${port.port}`)
                      }
                    >
                      <ArrowSquareOut weight="regular" />
                    </Button>
                  }
                />
              );
            }),
          )}
        </div>
      </section>
    </div>
  );
};

const ProcessRow: FC<{
  action: ReactNode;
  detail: string;
  name: string;
  service?: string;
}> = ({ action, detail, name, service }) => (
  <div className="flex items-center gap-2 px-2 py-1">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <span className="truncate">{name}</span>
        {service === undefined ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="
                shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px]
                font-medium text-muted-foreground
              "
              >
                {service}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              Most likely {service} because it commonly uses{" "}
              {name.toLowerCase()}.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="truncate font-mono text-[10px] text-muted-foreground">
        {detail}
      </div>
    </div>
    {action}
  </div>
);

const PanelMessage: FC<{ message: string }> = ({ message }) => (
  <div
    className="
    flex h-full items-center justify-center p-6 text-center text-xs
    text-muted-foreground
  "
  >
    {message}
  </div>
);
