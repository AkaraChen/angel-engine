import type { FC, ReactNode } from "react";
import type { WorkspaceToolPanelLayout } from "@/app/workspace/workspace-files-panels";

import { ArrowSquareOut, Cpu, Stop } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDaemonClient } from "@/platform/daemon";
import { cn } from "@/platform/utils";
import {
  killProcessMutationOptions,
  processRegistryQueryOptions,
} from "./requests/processes";
import { useWorkspaceToolStore } from "./workspace-tool-store";

interface WorkspaceProcessesViewProps {
  active: boolean;
  layout: WorkspaceToolPanelLayout;
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

interface WorkspaceProcessItem {
  command: string;
  key: string;
  name: string;
  pid: number;
}

interface WorkspacePortItem {
  address: string;
  key: string;
  pid: number;
  port: number;
  processName: string;
  service?: string;
}

export const WorkspaceProcessesView: FC<WorkspaceProcessesViewProps> = ({
  active,
  layout,
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

  if (client === null) {
    return <WorkspaceToolEmpty icon={Cpu} title="Backend unavailable" />;
  }
  if (registryQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={registryQuery.error.message}
        icon={Cpu}
        title="Processes unavailable"
      />
    );
  }
  if (registryQuery.data === undefined) {
    return null;
  }

  const entries = registryQuery.data.entries.filter(
    (entry) => entry.id === chatId,
  );
  const processes: WorkspaceProcessItem[] = entries.flatMap((entry) =>
    entry.processes.map((process) => ({
      command: process.command.join(" "),
      key: `${entry.id}-${process.pid}`,
      name: process.name,
      pid: process.pid,
    })),
  );
  const ports: WorkspacePortItem[] = entries.flatMap((entry) =>
    entry.ports.map((port) => {
      const process = entry.processes.find((item) => item.pid === port.pid);
      return {
        address: port.address,
        key: `${entry.id}-${port.pid}-${port.address}-${port.port}`,
        pid: port.pid,
        port: port.port,
        processName: process?.name ?? entry.label,
        service: COMMON_PORT_SERVICES[port.port],
      };
    }),
  );
  if (processes.length === 0 && ports.length === 0) {
    return (
      <WorkspaceToolEmpty
        detail="Processes the agent starts will show up here."
        icon={Cpu}
        title="No agent subprocesses running"
      />
    );
  }

  const kill = (pid: number, name: string) => {
    // The process inspector is already a desktop-only privileged surface.
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Kill ${name} (${pid})?`)) return;
    killMutation.mutate({ pid });
  };

  if (layout === "split") {
    return (
      <div className="h-full min-h-0 space-y-4 overflow-auto p-4">
        {processes.length > 0 ? (
          <ProcessCard title="Subprocesses">
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr
                  className="
                    border-b border-border-subtle text-left
                    text-muted-foreground
                  "
                >
                  <ProcessHeaderCell className="w-44">Name</ProcessHeaderCell>
                  <ProcessHeaderCell className="w-20">PID</ProcessHeaderCell>
                  <ProcessHeaderCell>Command</ProcessHeaderCell>
                  <ProcessHeaderCell className="w-20">
                    <span className="sr-only">Actions</span>
                  </ProcessHeaderCell>
                </tr>
              </thead>
              <tbody>
                {processes.map((process) => (
                  <tr
                    className="
                      border-b border-border-subtle transition-colors
                      last:border-b-0
                      hover:bg-overlay-hover
                    "
                    key={process.key}
                  >
                    <ProcessCell className="font-medium text-foreground">
                      {process.name}
                    </ProcessCell>
                    <ProcessCell className="font-mono text-muted-foreground">
                      {process.pid}
                    </ProcessCell>
                    <ProcessCell
                      className="font-mono text-muted-foreground"
                      title={process.command}
                    >
                      {process.command}
                    </ProcessCell>
                    <td className="px-2 py-1 text-right">
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => kill(process.pid, process.name)}
                      >
                        Kill
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ProcessCard>
        ) : null}
        {ports.length > 0 ? (
          <ProcessCard title="Listening ports">
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr
                  className="
                    border-b border-border-subtle text-left
                    text-muted-foreground
                  "
                >
                  <ProcessHeaderCell className="w-20">Port</ProcessHeaderCell>
                  <ProcessHeaderCell className="w-32">
                    Service
                  </ProcessHeaderCell>
                  <ProcessHeaderCell className="w-44">
                    Address
                  </ProcessHeaderCell>
                  <ProcessHeaderCell>Process</ProcessHeaderCell>
                  <ProcessHeaderCell className="w-20">
                    <span className="sr-only">Actions</span>
                  </ProcessHeaderCell>
                </tr>
              </thead>
              <tbody>
                {ports.map((port) => (
                  <tr
                    className="
                      border-b border-border-subtle transition-colors
                      last:border-b-0
                      hover:bg-overlay-hover
                    "
                    key={port.key}
                  >
                    <ProcessCell className="font-medium text-foreground">
                      {port.port}
                    </ProcessCell>
                    <ProcessCell className="text-muted-foreground">
                      {port.service ?? "—"}
                    </ProcessCell>
                    <ProcessCell className="font-mono text-muted-foreground">
                      {port.address}:{port.port}
                    </ProcessCell>
                    <ProcessCell className="text-muted-foreground">
                      {port.processName} ({port.pid})
                    </ProcessCell>
                    <td className="px-2 py-1 text-right">
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() =>
                          onOpenBrowser(`http://localhost:${port.port}`)
                        }
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ProcessCard>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      {processes.length > 0 ? (
        <ProcessSection title="Subprocesses">
          {processes.map((process) => (
            <ProcessRow
              detail={`${process.pid} · ${process.command}`}
              key={process.key}
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
          ))}
        </ProcessSection>
      ) : null}
      {ports.length > 0 ? (
        <ProcessSection title="Listening ports">
          {ports.map((port) => (
            <ProcessRow
              detail={`${port.address}:${port.port} — ${port.processName} (${port.pid})`}
              key={port.key}
              name={`Port ${port.port}`}
              service={port.service}
              action={
                <Button
                  aria-label={`Open port ${port.port} in browser tab`}
                  size="icon-sm"
                  title={`Open port ${port.port} in browser tab`}
                  variant="ghost"
                  onClick={() => onOpenBrowser(`http://localhost:${port.port}`)}
                >
                  <ArrowSquareOut weight="regular" />
                </Button>
              }
            />
          ))}
        </ProcessSection>
      ) : null}
    </div>
  );
};

const ProcessCard: FC<{ children: ReactNode; title: string }> = ({
  children,
  title,
}) => (
  <section
    className="
      min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-card
      shadow-xs
    "
  >
    <h2
      className="
        border-b border-border-subtle px-3 py-2 text-xs font-medium
        tracking-wide text-muted-foreground
      "
    >
      {title}
    </h2>
    {children}
  </section>
);

const ProcessHeaderCell: FC<{ children: ReactNode; className?: string }> = ({
  children,
  className,
}) => <th className={cn("px-3 py-2 font-medium", className)}>{children}</th>;

const ProcessCell: FC<{
  children: ReactNode;
  className?: string;
  title?: string;
}> = ({ children, className, title }) => (
  <td className={cn("px-3 py-1.5", className)}>
    <div className="truncate" title={title}>
      {children}
    </div>
  </td>
);

const ProcessSection: FC<{ children: ReactNode; title: string }> = ({
  children,
  title,
}) => (
  <section className="shrink-0 p-3">
    <h2
      className="
        mb-2 pl-2 text-xs font-medium tracking-wide text-muted-foreground
      "
    >
      {title}
    </h2>
    <div className="space-y-0.5">{children}</div>
  </section>
);

const ProcessRow: FC<{
  action: ReactNode;
  detail: string;
  name: string;
  service?: string;
}> = ({ action, detail, name, service }) => (
  <div
    className="
      flex items-center gap-2 rounded-md px-2 py-1 transition-colors
      hover:bg-overlay-hover
    "
  >
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
