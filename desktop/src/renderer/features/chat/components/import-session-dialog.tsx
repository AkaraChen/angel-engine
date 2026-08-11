import type { Chat, ImportableSession } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { KeyboardEvent, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";
import {
  alreadyImportedRemoteIds,
  clearImportSelection,
  failedImportRemoteIds,
  filterImportableSessions,
  type ImportSessionApi,
  type ImportSessionItemResult,
  type ImportSessionsBatchResult,
  importSessionsBatch,
  importSubmitBlockReason,
  importableSessionPrimaryLabel,
  searchImportableSessions,
  selectAllImportIds,
  successfulImportChatIds,
  toggleImportSelection,
} from "./import-session-handlers";

export interface ImportSessionRuntimeOption {
  label: string;
  value: string;
}

export interface ImportSessionDialogProps {
  api: ImportSessionApi;
  cwd?: string | null;
  existingChats: readonly Chat[];
  initialProjectId?: string | null;
  initialRuntime?: string | null;
  onClose: () => void;
  onImported: (chatIds: string[]) => void | Promise<void>;
  open: boolean;
  projects: readonly Project[];
  runtimeOptions: readonly ImportSessionRuntimeOption[];
}

type DialogPhase = "select" | "importing" | "results";

export function ImportSessionDialog({
  api,
  cwd,
  existingChats,
  initialProjectId,
  initialRuntime,
  onClose,
  onImported,
  open,
  projects,
  runtimeOptions,
}: ImportSessionDialogProps): ReactElement {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<DialogPhase>("select");
  const [runtime, setRuntime] = useState("");
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ImportableSession[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [progressItems, setProgressItems] = useState<ImportSessionItemResult[]>(
    [],
  );
  const [batchResult, setBatchResult] =
    useState<ImportSessionsBatchResult | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const resetState = useCallback(() => {
    setPhase("select");
    setRuntime("");
    setProjectId("");
    setQuery("");
    setLoading(false);
    setError(null);
    setSessions([]);
    setSelected(clearImportSelection());
    setAnchorId(null);
    setFocusedIndex(0);
    setProgressItems([]);
    setBatchResult(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    const defaultRuntime = is.nonEmptyString(initialRuntime)
      ? initialRuntime
      : (runtimeOptions[0]?.value ?? "");
    const defaultProject = is.nonEmptyString(initialProjectId)
      ? initialProjectId
      : "";
    setRuntime(defaultRuntime);
    setProjectId(defaultProject);
    setPhase("select");
    setQuery("");
    setSelected(clearImportSelection());
    setAnchorId(null);
    setFocusedIndex(0);
    setProgressItems([]);
    setBatchResult(null);
    setError(null);
  }, [initialProjectId, initialRuntime, open, resetState, runtimeOptions]);

  useEffect(() => {
    if (!open || phase !== "select") return;
    if (!is.nonEmptyString(runtime)) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSessions([]);
    setSelected(clearImportSelection());
    setAnchorId(null);

    void searchImportableSessions(api, {
      cwd: cwd ?? undefined,
      projectId: is.nonEmptyString(projectId) ? projectId : undefined,
      runtime,
    })
      .then((next) => {
        if (cancelled) return;
        setSessions(next.sessions);
        if (is.nonEmptyString(next.unsupportedReason)) {
          setError(next.unsupportedReason);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : t("dialog.importSession.searchFailed"),
        );
        setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` identity is unstable under test mocks
  }, [api, cwd, open, phase, projectId, runtime]);

  const importedMap = useMemo(
    () => alreadyImportedRemoteIds(existingChats, runtime),
    [existingChats, runtime],
  );

  const filteredSessions = useMemo(
    () => filterImportableSessions(sessions, query),
    [query, sessions],
  );

  const orderedIds = useMemo(
    () => filteredSessions.map((session) => session.remoteId),
    [filteredSessions],
  );

  const sessionsById = useMemo(() => {
    const map = new Map<string, ImportableSession>();
    for (const session of sessions) {
      map.set(session.remoteId, session);
    }
    return map;
  }, [sessions]);

  const selectedCount = selected.size;
  const blockReason = importSubmitBlockReason({
    hasProject: is.nonEmptyString(projectId),
    hasRuntime: is.nonEmptyString(runtime),
    importing: phase === "importing",
    selectedCount,
  });

  const blockReasonLabel = useMemo(() => {
    switch (blockReason) {
      case "runtime":
        return t("dialog.importSession.runtimeRequired");
      case "project":
        return t("dialog.importSession.projectRequired");
      case "selection":
        return t("dialog.importSession.selectionRequired");
      case "importing":
        return t("dialog.importSession.importing");
      case null:
        return null;
    }
  }, [blockReason, t]);

  const handleToggle = useCallback(
    (remoteId: string, shift: boolean) => {
      if (phase !== "select") return;
      const next = toggleImportSelection({
        anchorId,
        orderedIds,
        remoteId,
        selected,
        shift,
      });
      setSelected(next.selected);
      setAnchorId(next.anchorId);
      const index = orderedIds.indexOf(remoteId);
      if (index >= 0) setFocusedIndex(index);
    },
    [anchorId, orderedIds, phase, selected],
  );

  const handleSelectAllVisible = useCallback(() => {
    // Select-all targets the filtered list only; already-imported stay
    // selectable so the user can deliberately create a copy.
    setSelected(selectAllImportIds(orderedIds));
    setAnchorId(orderedIds[0] ?? null);
  }, [orderedIds]);

  const handleClearSelection = useCallback(() => {
    setSelected(clearImportSelection());
    setAnchorId(null);
  }, []);

  const runImport = useCallback(
    async (remoteIds: readonly string[]) => {
      if (!is.nonEmptyString(runtime) || !is.nonEmptyString(projectId)) return;
      if (remoteIds.length === 0) return;

      setPhase("importing");
      setError(null);
      setBatchResult(null);
      setProgressItems([]);

      try {
        const result = await importSessionsBatch(api, {
          cwd,
          onProgress: setProgressItems,
          projectId,
          remoteIds,
          runtime,
          sessionsById,
        });
        setBatchResult(result);
        setProgressItems(result.items);
        setPhase("results");

        const chatIds = successfulImportChatIds(result.items);
        if (chatIds.length > 0) {
          try {
            await onImported(chatIds);
          } catch {
            // Navigation/refetch failures are non-fatal for the import itself.
          }
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t("dialog.importSession.importFailed"),
        );
        setPhase("select");
      }
    },
    [api, cwd, onImported, projectId, runtime, sessionsById, t],
  );

  const handleImportSelected = useCallback(() => {
    if (blockReason !== null) return;
    void runImport([...selected]);
  }, [blockReason, runImport, selected]);

  const handleRetryFailed = useCallback(() => {
    if (!batchResult) return;
    const failedIds = failedImportRemoteIds(batchResult.items);
    if (failedIds.length === 0) return;
    setSelected(new Set(failedIds));
    void runImport(failedIds);
  }, [batchResult, runImport]);

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (phase !== "select" || orderedIds.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((index) => Math.min(index + 1, orderedIds.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        const remoteId = orderedIds[focusedIndex];
        if (is.nonEmptyString(remoteId)) {
          handleToggle(remoteId, event.shiftKey);
        }
      }
    },
    [focusedIndex, handleToggle, orderedIds, phase],
  );

  useEffect(() => {
    if (focusedIndex >= orderedIds.length) {
      setFocusedIndex(Math.max(0, orderedIds.length - 1));
    }
  }, [focusedIndex, orderedIds.length]);

  const handleOpenChange = (next: boolean) => {
    if (!next && phase !== "importing") {
      onClose();
    }
  };

  const summaryLabel = batchResult
    ? t("dialog.importSession.summary", {
        failed: batchResult.failed,
        succeeded: batchResult.succeeded,
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-4 rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialog.importSession.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.importSession.description")}
          </DialogDescription>
        </DialogHeader>

        {phase === "select" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                {t("dialog.importSession.sourceAgent")}
                <NativeSelect
                  aria-label={t("dialog.importSession.sourceAgent")}
                  className="w-full"
                  disabled={runtimeOptions.length === 0}
                  onChange={(event) => setRuntime(event.currentTarget.value)}
                  selectClassName="h-9 w-full rounded-md border-border bg-background py-0 pr-8 pl-3 text-sm"
                  value={runtime}
                >
                  {runtimeOptions.length === 0 ? (
                    <NativeSelectOption value="">
                      {t("dialog.importSession.runtimeRequired")}
                    </NativeSelectOption>
                  ) : null}
                  {runtimeOptions.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>

              <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                {t("dialog.importSession.targetProject")}
                <NativeSelect
                  aria-invalid={!is.nonEmptyString(projectId)}
                  aria-label={t("dialog.importSession.targetProject")}
                  className="w-full"
                  onChange={(event) => setProjectId(event.currentTarget.value)}
                  selectClassName="h-9 w-full rounded-md border-border bg-background py-0 pr-8 pl-3 text-sm"
                  value={projectId}
                >
                  <NativeSelectOption value="">
                    {t("dialog.importSession.projectPlaceholder")}
                  </NativeSelectOption>
                  {projects.map((project) => (
                    <NativeSelectOption key={project.id} value={project.id}>
                      {getProjectDisplayName(project.path)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>

            {is.nonEmptyString(cwd) ? (
              <div
                className="truncate text-xs text-muted-foreground"
                title={cwd}
              >
                {t("dialog.importSession.cwdLabel", { cwd })}
              </div>
            ) : null}

            <Input
              aria-label={t("dialog.importSession.searchPlaceholder")}
              disabled={!is.nonEmptyString(runtime) || loading}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t("dialog.importSession.searchPlaceholder")}
              ref={searchRef}
              value={query}
            />

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {t("dialog.importSession.selectedCount", {
                  count: selectedCount,
                })}
              </span>
              <Button
                disabled={orderedIds.length === 0}
                onClick={handleSelectAllVisible}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("dialog.importSession.selectAll")}
              </Button>
              <Button
                disabled={selectedCount === 0}
                onClick={handleClearSelection}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("dialog.importSession.clearSelection")}
              </Button>
            </div>

            {loading ? <ImportSessionListSkeleton /> : null}

            {!loading && error ? (
              <div className="text-sm text-destructive" role="alert">
                {error}
              </div>
            ) : null}

            {!loading && !error && !is.nonEmptyString(runtime) ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("dialog.importSession.runtimeRequired")}
              </div>
            ) : null}

            {!loading &&
            is.nonEmptyString(runtime) &&
            filteredSessions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {sessions.length === 0
                  ? t("dialog.importSession.empty")
                  : t("dialog.importSession.emptyFilter")}
              </div>
            ) : null}

            {!loading && filteredSessions.length > 0 ? (
              <ul
                aria-label={t("dialog.importSession.sessionList")}
                className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border-subtle p-1"
                onKeyDown={handleListKeyDown}
                ref={listRef}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: list is keyboard-navigable for multi-select
                tabIndex={0}
              >
                {filteredSessions.map((session, index) => {
                  const isSelected = selected.has(session.remoteId);
                  const alreadyImported = importedMap.has(session.remoteId);
                  const secondaryParts: string[] = [];
                  if (is.nonEmptyString(session.cwd)) {
                    secondaryParts.push(session.cwd);
                  }
                  if (is.nonEmptyString(session.updatedAt)) {
                    secondaryParts.push(formatDateTime(session.updatedAt));
                  }
                  return (
                    <li key={session.remoteId}>
                      <div
                        aria-checked={isSelected}
                        className={cn(
                          `
                            flex w-full cursor-pointer items-start gap-3
                            rounded-lg px-3 py-2.5 text-left transition-colors
                            hover:bg-overlay-hover
                          `,
                          isSelected && "bg-primary-soft",
                          focusedIndex === index &&
                            "ring-2 ring-ring/50 ring-offset-1 ring-offset-background",
                        )}
                        onClick={(event) =>
                          handleToggle(session.remoteId, event.shiftKey)
                        }
                        onKeyDown={(event) => {
                          if (event.key === " " || event.key === "Enter") {
                            event.preventDefault();
                            handleToggle(session.remoteId, event.shiftKey);
                          }
                        }}
                        role="checkbox"
                        // biome-ignore lint/a11y/noNoninteractiveTabindex: row is a multi-select target
                        tabIndex={0}
                      >
                        <Checkbox
                          aria-label={importableSessionPrimaryLabel(session)}
                          checked={isSelected}
                          className="mt-0.5"
                          onCheckedChange={() =>
                            handleToggle(session.remoteId, false)
                          }
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-sm font-medium">
                              {importableSessionPrimaryLabel(session)}
                            </span>
                            {alreadyImported ? (
                              <span
                                className="
                                  shrink-0 rounded-full bg-muted px-2 py-0.5
                                  text-[0.625rem] tracking-wide
                                  text-muted-foreground uppercase
                                "
                              >
                                {t("dialog.importSession.alreadyImported")}
                              </span>
                            ) : null}
                          </div>
                          {secondaryParts.length > 0 ? (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {secondaryParts.join(" · ")}
                            </div>
                          ) : null}
                          {alreadyImported && isSelected ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t("dialog.importSession.willCreateCopy")}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : null}

        {phase === "importing" || phase === "results" ? (
          <div className="space-y-3">
            {summaryLabel && phase === "results" ? (
              <div className="text-sm font-medium">{summaryLabel}</div>
            ) : null}
            {phase === "importing" ? (
              <div className="text-sm text-muted-foreground">
                {t("dialog.importSession.importingProgress", {
                  done: progressItems.filter(
                    (item) =>
                      item.status === "success" || item.status === "failed",
                  ).length,
                  total: progressItems.length,
                })}
              </div>
            ) : null}
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border-subtle p-1">
              {(progressItems.length > 0
                ? progressItems
                : selected.size > 0
                  ? [...selected].map((remoteId) => ({
                      remoteId,
                      status: "pending" as const,
                      title: importableSessionPrimaryLabel(
                        sessionsById.get(remoteId) ?? {
                          remoteId,
                          title: null,
                        },
                      ),
                    }))
                  : []
              ).map((item) => (
                <li
                  key={item.remoteId}
                  className="flex items-start justify-between gap-3 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.title}
                    </div>
                    {item.status === "failed" &&
                    is.nonEmptyString(item.error) ? (
                      <div className="mt-0.5 text-xs text-destructive">
                        {item.error}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      item.status === "failed" && "text-destructive",
                      item.status === "success" && "text-muted-foreground",
                    )}
                  >
                    {t(`dialog.importSession.status.${item.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {phase === "select" && error === null && blockReasonLabel ? (
          <div className="text-xs text-muted-foreground">
            {blockReasonLabel}
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button
            onClick={onClose}
            type="button"
            variant="outline"
            disabled={phase === "importing"}
          >
            {phase === "results"
              ? t("dialog.importSession.done")
              : t("common.cancel")}
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {phase === "results" && batchResult && batchResult.failed > 0 ? (
              <Button
                onClick={handleRetryFailed}
                type="button"
                variant="outline"
              >
                {t("dialog.importSession.retryFailed", {
                  count: batchResult.failed,
                })}
              </Button>
            ) : null}
            {phase === "select" ? (
              <Button
                disabled={blockReason !== null}
                onClick={handleImportSelected}
                type="button"
              >
                {t("dialog.importSession.importAction", {
                  count: selectedCount,
                })}
              </Button>
            ) : null}
            {phase === "results" ? (
              <Button
                onClick={() => {
                  setPhase("select");
                  setBatchResult(null);
                  setProgressItems([]);
                  setSelected(clearImportSelection());
                }}
                type="button"
              >
                {t("dialog.importSession.importMore")}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSessionListSkeleton(): ReactElement {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="space-y-2 rounded-xl border border-border-subtle p-2"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div className="flex items-start gap-3 px-2 py-2" key={index}>
          <Skeleton className="mt-0.5 size-4 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
