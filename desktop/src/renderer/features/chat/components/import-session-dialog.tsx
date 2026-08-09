import type {
  ImportableSession,
  ListImportableSessionsResult,
} from "@angel-engine/daemon-api/chat";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/platform/utils";
import {
  type ImportSessionApi,
  importSessionAndOpen,
  importableSessionPrimaryLabel,
  importableSessionSecondaryLabel,
  searchImportableSessions,
} from "./import-session-handlers";

export interface ImportSessionDialogProps {
  api: ImportSessionApi;
  cwd?: string | null;
  open: boolean;
  onClose: () => void;
  onImported: (chatId: string) => void | Promise<void>;
  projectId?: string | null;
  runtime?: string | null;
}

export function ImportSessionDialog({
  api,
  cwd,
  open,
  onClose,
  onImported,
  projectId,
  runtime,
}: ImportSessionDialogProps): ReactElement {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListImportableSessionsResult | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setImportingId(null);
      setError(null);
      setResult(null);
      return;
    }
    if (!is.nonEmptyString(runtime)) {
      setError(t("dialog.importSession.runtimeRequired"));
      setResult({ sessions: [], nextCursor: null, unsupportedReason: null });
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    void searchImportableSessions(api, {
      cwd: cwd ?? undefined,
      projectId: projectId ?? undefined,
      runtime,
    })
      .then((next) => {
        if (cancelled) return;
        setResult(next);
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
        setResult({ sessions: [], nextCursor: null, unsupportedReason: null });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, cwd, open, projectId, runtime, t]);

  const handleImport = async (session: ImportableSession) => {
    if (!is.nonEmptyString(runtime) || importingId) return;
    setImportingId(session.remoteId);
    setError(null);
    try {
      const imported = await importSessionAndOpen(api, {
        cwd: session.cwd ?? cwd ?? undefined,
        projectId: projectId ?? undefined,
        remoteThreadId: session.remoteId,
        runtime,
        title: session.title ?? undefined,
      });
      await onImported(imported.chat.id);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("dialog.importSession.importFailed"),
      );
    } finally {
      setImportingId(null);
    }
  };

  const sessions = result?.sessions ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-4 rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.importSession.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.importSession.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="text-muted-foreground text-sm">
          {is.nonEmptyString(runtime)
            ? t("dialog.importSession.runtimeLabel", { runtime })
            : t("dialog.importSession.runtimeRequired")}
          {is.nonEmptyString(cwd) ? (
            <div className="mt-1 truncate" title={cwd}>
              {t("dialog.importSession.cwdLabel", { cwd })}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            {t("dialog.importSession.searching")}
          </div>
        ) : null}

        {!loading && error ? (
          <div className="text-destructive text-sm" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && !error && sessions.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            {t("dialog.importSession.empty")}
          </div>
        ) : null}

        {!loading && sessions.length > 0 ? (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {sessions.map((session) => {
              const secondary = importableSessionSecondaryLabel(session);
              const busy = importingId === session.remoteId;
              return (
                <li key={session.remoteId}>
                  <button
                    className={cn(
                      "hover:bg-accent flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition-colors",
                      busy && "opacity-70",
                    )}
                    disabled={Boolean(importingId)}
                    onClick={() => void handleImport(session)}
                    type="button"
                  >
                    <span className="font-medium">
                      {importableSessionPrimaryLabel(session)}
                    </span>
                    {secondary ? (
                      <span className="text-muted-foreground mt-0.5 text-xs">
                        {secondary}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground mt-1 text-xs">
                      {busy
                        ? t("dialog.importSession.importing")
                        : t("dialog.importSession.importAction")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="flex justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
