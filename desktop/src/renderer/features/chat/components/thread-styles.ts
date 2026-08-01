export const iconButtonClass =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-hover hover:text-foreground active:bg-overlay-active disabled:pointer-events-none disabled:opacity-40";

export const messageActionFooterClass =
  "flex h-7 max-w-full shrink-0 flex-nowrap items-center gap-1 overflow-hidden";

/**
 * Tool calls: a recessed surface behind the message, held by a hairline. Uses
 * `--border` rather than `--border-subtle` because the fill here is
 * `--surface-1`, and subtle-on-surface-1 differs by ~5/255 — an edge that never
 * actually draws. Every tool card carries this same neutral hairline whatever
 * its phase; status lives in the icon and the phase label, never the frame.
 *
 * No backdrop-filter — a long thread stacks hundreds of these and every blur
 * layer is paid again on each scroll frame.
 */
export const toolCardClass =
  "w-full overflow-hidden rounded-lg border border-border bg-surface-1 text-xs";

/**
 * Plans and other inspector cards: the one transcript surface that lifts onto
 * card white, since a plan is a standing artifact rather than a log line.
 */
export const inspectorCardClass =
  "w-full overflow-hidden rounded-xl border border-border-subtle bg-card text-xs shadow-xs";

export const nativeControlRowClass =
  "min-w-0 rounded-md transition-colors hover:bg-overlay-hover active:bg-overlay-active";

export const workspaceContentColumnClass =
  "mx-auto w-full max-w-[var(--workspace-content-max-width)]";
