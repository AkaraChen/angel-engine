import { useDaemonHealth } from "@/platform/use-daemon-health";

/**
 * Tiny status line that exercises the daemon API client + TanStack Query wiring
 * end to end. Purely a foundation smoke test; page sub-issues can remove it.
 */
export function DaemonStatus() {
  const { data, isPending, isError } = useDaemonHealth();

  const label = isError
    ? "Daemon unreachable"
    : isPending
      ? "Connecting to daemon…"
      : `Daemon online · v${data.version}`;

  const dotClass = isError
    ? "bg-destructive"
    : isPending
      ? "bg-muted-foreground"
      : "bg-green-500";

  return (
    <div
      className="
      flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground
    "
    >
      <span
        className={`
        size-1.5 shrink-0 rounded-full
        ${dotClass}
      `}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}
