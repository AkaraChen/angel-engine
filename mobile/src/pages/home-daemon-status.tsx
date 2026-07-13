import { useDaemonHealth } from "@/platform/use-daemon-health";

/**
 * Tiny banner that exercises the daemon API client + TanStack Query wiring end
 * to end. Purely a foundation smoke test; page sub-issues can remove it.
 */
export function DaemonStatus() {
  const { data, isPending, isError } = useDaemonHealth();

  const label = isError
    ? "Daemon unreachable"
    : isPending
      ? "Connecting to daemon…"
      : `Daemon online · v${data.version}`;

  return (
    <p className="shrink-0 px-4 pb-2 text-xs text-muted-foreground">{label}</p>
  );
}
