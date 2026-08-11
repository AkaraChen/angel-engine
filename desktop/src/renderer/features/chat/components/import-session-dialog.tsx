import type { ReactElement } from "react";
import type {
  ImportableRuntimeOption,
  ImportableSessionRow,
} from "./import-session-handlers";

import { Check, MagnifyingGlass } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";
import {
  type ImportSessionApi,
  filterImportableSessionRows,
  importSessionAndOpen,
  importableSessionPrimaryLabel,
  loadImportableSessions,
  selectionRange,
} from "./import-session-handlers";

/**
 * Where the picked sessions land. The dialog is always opened from a place that
 * already knows the destination -- a project row, or the project the current
 * draft belongs to -- so the target is context, never a field the user fills in.
 */
export interface ImportSessionTarget {
  cwd?: string | null;
  projectId?: string | null;
  projectName: string;
}

export interface ImportSessionDialogProps {
  api: ImportSessionApi;
  onClose: () => void;
  onImported: (chatIds: string[]) => void | Promise<void>;
  runtimeOptions: ImportableRuntimeOption[];
  /** Non-null opens the dialog; the value is the destination. */
  target: ImportSessionTarget | null;
}

export function ImportSessionDialog({
  api,
  onClose,
  onImported,
  runtimeOptions,
  target,
}: ImportSessionDialogProps): ReactElement {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ImportableSessionRow[]>([]);
  const [failures, setFailures] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [runtimeFilter, setRuntimeFilter] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const listRef = useRef<HTMLDivElement | null>(null);

  const open = target !== null;
  const cwd = target?.cwd ?? null;
  const projectId = target?.projectId ?? null;

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setRows([]);
      setFailures(new Map());
      setQuery("");
      setRuntimeFilter(null);
      setSelectedKeys([]);
      setAnchorKey(null);
      setImporting(false);
      setRowErrors(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);
    void loadImportableSessions(api, {
      cwd,
      projectId,
      runtimes: runtimeOptions,
    })
      .then((next) => {
        if (cancelled) return;
        setRows(next.rows);
        setFailures(next.failures);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, cwd, open, projectId, runtimeOptions]);

  const countsByRuntime = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.runtime, (counts.get(row.runtime) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  // The agent row is a filter, not a required choice: with a single agent in
  // play there is nothing to filter, so it earns no pixels.
  const filterChips = useMemo(
    () => runtimeOptions.filter((option) => countsByRuntime.has(option.value)),
    [countsByRuntime, runtimeOptions],
  );

  const visibleRows = useMemo(
    () => filterImportableSessionRows(rows, { query, runtime: runtimeFilter }),
    [query, rows, runtimeFilter],
  );
  const visibleKeys = useMemo(
    () => visibleRows.map((row) => row.key),
    [visibleRows],
  );
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const toggleKeys = useCallback((keys: string[], shouldSelect: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (shouldSelect) next.add(key);
        else next.delete(key);
      }
      return [...next];
    });
  }, []);

  const handleRowClick = (key: string, shiftKey: boolean) => {
    if (importing) return;
    if (shiftKey) {
      toggleKeys(selectionRange(visibleKeys, anchorKey, key), true);
      setAnchorKey(key);
      return;
    }
    toggleKeys([key], !selected.has(key));
    setAnchorKey(key);
  };

  const runImport = useCallback(
    async (keys: string[]) => {
      if (target === null || keys.length === 0 || importing) return;
      setImporting(true);
      setRowErrors(new Map());

      const byKey = new Map(rows.map((row) => [row.key, row]));
      const importedIds: string[] = [];
      const importedKeys = new Set<string>();
      const failed = new Map<string, string>();

      for (const key of keys) {
        const row = byKey.get(key);
        if (row === undefined) continue;
        try {
          const imported = await importSessionAndOpen(api, {
            cwd: row.session.cwd ?? target.cwd ?? undefined,
            projectId: target.projectId ?? undefined,
            remoteThreadId: row.session.remoteId,
            runtime: row.runtime,
            title: row.session.title ?? undefined,
          });
          importedIds.push(imported.chat.id);
          importedKeys.add(key);
        } catch (cause) {
          failed.set(
            key,
            cause instanceof Error
              ? cause.message
              : t("dialog.importSession.importFailed"),
          );
        }
      }

      setImporting(false);

      // Successes are permanent even if a sibling failed; keep only the failed
      // rows selected so the primary button becomes a retry for exactly those.
      if (failed.size > 0) {
        setRowErrors(failed);
        setSelectedKeys([...failed.keys()]);
        if (importedIds.length > 0) {
          setRows((current) =>
            current.filter((row) => !importedKeys.has(row.key)),
          );
          void onImported(importedIds);
        }
        return;
      }

      onClose();
      try {
        await onImported(importedIds);
      } catch {
        // Navigation/refetch failures are non-fatal for the import itself.
      }
    },
    [api, importing, onClose, onImported, rows, t, target],
  );

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void runImport(selectedKeys);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      toggleKeys(visibleKeys, true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    const items =
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-import-row]");
    if (items === undefined || items.length === 0) return;
    event.preventDefault();
    const active = document.activeElement;
    const currentIndex = [...items].findIndex((item) => item === active);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      currentIndex < 0
        ? event.key === "ArrowDown"
          ? 0
          : items.length - 1
        : (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const selectedCount = selectedKeys.length;
  const hasFailures = rowErrors.size > 0;
  const failureNote = [...failures.values()][0] ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="gap-4 rounded-2xl sm:max-w-xl"
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader>
          <DialogTitle>
            {t("dialog.importSession.titleForProject", {
              projectName: target?.projectName ?? "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.importSession.description")}
          </DialogDescription>
        </DialogHeader>

        {/* With nothing to search and nothing to submit, the box and the
            button are dead chrome -- the empty line already says everything. */}
        {loading || rows.length > 0 ? (
          <div className="relative">
            <MagnifyingGlass
              aria-hidden="true"
              className="
              pointer-events-none absolute top-1/2 left-3 size-4
              -translate-y-1/2 text-muted-foreground
            "
            />
            <Input
              aria-label={t("dialog.importSession.searchPlaceholder")}
              autoFocus
              className="pl-9"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t("dialog.importSession.searchPlaceholder")}
              value={query}
            />
          </div>
        ) : null}

        {filterChips.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <RuntimeChip
              active={runtimeFilter === null}
              count={rows.length}
              label={t("dialog.importSession.allAgents")}
              onSelect={() => setRuntimeFilter(null)}
            />
            {filterChips.map((option) => (
              <RuntimeChip
                active={runtimeFilter === option.value}
                count={countsByRuntime.get(option.value) ?? 0}
                key={option.value}
                label={option.label}
                onSelect={() => setRuntimeFilter(option.value)}
              />
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton className="h-12 w-full rounded-xl" key={index} />
            ))}
          </div>
        ) : null}

        {!loading && visibleRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? t("dialog.importSession.empty")
              : t("dialog.importSession.noMatches")}
          </div>
        ) : null}

        {!loading && visibleRows.length > 0 ? (
          <div className="max-h-80 space-y-0.5 overflow-y-auto" ref={listRef}>
            {visibleRows.map((row) => {
              const isSelected = selected.has(row.key);
              const error = rowErrors.get(row.key);
              const updatedAt = row.session.updatedAt;
              return (
                <button
                  aria-pressed={isSelected}
                  className={cn(
                    `
                      group flex w-full items-center gap-3 rounded-xl px-3 py-2
                      text-left transition-colors
                      hover:bg-overlay-hover
                      focus-visible:bg-overlay-hover focus-visible:outline-none
                    `,
                    isSelected && "bg-overlay-hover",
                    importing && !isSelected && "opacity-50",
                  )}
                  data-import-row=""
                  disabled={importing}
                  key={row.key}
                  onClick={(event) => handleRowClick(row.key, event.shiftKey)}
                  type="button"
                >
                  {/* The box keeps its slot so nothing shifts, but only shows
                      up once the row is in play -- a resting list should read
                      as things you can pick, not as a filled-in form. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      `
                        flex size-4 shrink-0 items-center justify-center
                        rounded-[5px] border border-border-subtle opacity-0
                        transition-opacity
                        group-hover:opacity-100
                        group-focus-visible:opacity-100
                      `,
                      isSelected &&
                        "border-transparent bg-primary-strong text-primary-foreground opacity-100",
                    )}
                  >
                    {isSelected ? (
                      <Check className="size-3" weight="bold" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {importableSessionPrimaryLabel(row.session)}
                    </span>
                    {is.nonEmptyString(error) ? (
                      <span className="block truncate text-xs text-destructive">
                        {error}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {filterChips.length > 1 ? `${row.runtimeLabel} · ` : ""}
                    {is.nonEmptyString(updatedAt)
                      ? formatRelativeTime(updatedAt)
                      : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {is.nonEmptyString(failureNote) ? (
          <p className="text-xs text-muted-foreground">{failureNote}</p>
        ) : null}

        {loading || rows.length > 0 ? (
          <div className="flex items-center justify-between gap-3">
            {selectedCount > 0 ? (
              <button
                className="
                text-xs text-muted-foreground underline underline-offset-3
                hover:text-foreground
              "
                disabled={importing}
                onClick={() => setSelectedKeys([])}
                type="button"
              >
                {t("dialog.importSession.clearSelection", {
                  selected: selectedCount,
                })}
              </button>
            ) : (
              <span />
            )}
            <Button
              disabled={selectedCount === 0 || importing}
              onClick={() => void runImport(selectedKeys)}
              type="button"
            >
              {importing
                ? t("dialog.importSession.importing")
                : hasFailures
                  ? t("dialog.importSession.retryAction", {
                      selected: selectedCount,
                    })
                  : t("dialog.importSession.importAction", {
                      projectName: target?.projectName ?? "",
                      selected: selectedCount,
                    })}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RuntimeChip({
  active,
  count,
  label,
  onSelect,
}: {
  active: boolean;
  count: number;
  label: string;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={active}
      className={cn(
        `
          rounded-full border border-border-subtle px-2.5 py-1 text-xs
          text-muted-foreground transition-colors
          hover:bg-overlay-hover
        `,
        active &&
          "border-transparent bg-primary-strong text-primary-foreground",
      )}
      onClick={onSelect}
      type="button"
    >
      {label}
      <span className="ml-1 tabular-nums opacity-70">{count}</span>
    </button>
  );
}
