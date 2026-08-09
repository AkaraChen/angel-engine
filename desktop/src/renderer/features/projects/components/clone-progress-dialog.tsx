import type {
  Project,
  ProjectCloneStage,
} from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";

import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import is from "@sindresorhus/is";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invalidateProjectQueries } from "@/features/projects/api/queries";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

/** Each stage's share of the single bar, so it only ever moves forward. */
const STAGE_WEIGHTS: ReadonlyArray<{
  share: number;
  stage: Exclude<ProjectCloneStage, "completed">;
  start: number;
}> = [
  { share: 10, stage: "preparing", start: 0 },
  { share: 80, stage: "cloning", start: 10 },
  { share: 10, stage: "registering", start: 90 },
];

const STAGE_LABEL_KEYS: Record<ProjectCloneStage, string> = {
  cloning: "projectImport.stageCloning",
  completed: "projectImport.stageCompleted",
  preparing: "projectImport.stagePreparing",
  registering: "projectImport.stageRegistering",
};

interface CloneProgress {
  detail: string | null;
  percent: number;
  stage: ProjectCloneStage;
  targetPath: string | null;
}

interface CloneOutcome {
  project: Project;
  reusedExistingCheckout: boolean;
}

interface CloneProgressDialogProps {
  onClose: () => void;
  onOpenProject: (project: Project) => void;
  /** Clone source; a new value starts a new clone. Null keeps the dialog shut. */
  url: string | null;
}

/**
 * Runs one clone and shows where it is. The stream is the only progress source,
 * so the dialog stays open until it settles rather than closing optimistically.
 */
export function CloneProgressDialog({
  onClose,
  onOpenProject,
  url,
}: CloneProgressDialogProps): ReactElement {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [outcome, setOutcome] = useState<CloneOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!is.nonEmptyString(url)) return;

    const controller = new AbortController();
    let cancelled = false;
    setProgress(null);
    setOutcome(null);
    setError(null);

    const run = async () => {
      try {
        for await (const event of api.projects.clone(
          { url },
          controller.signal,
        )) {
          if (cancelled) return;
          if (event.type === "progress") {
            setProgress({
              detail: event.detail,
              percent: overallPercent(event.stage, event.percent),
              stage: event.stage,
              targetPath: event.targetPath,
            });
          } else if (event.type === "failed") {
            setError(event.message);
          } else {
            setOutcome({
              project: event.project,
              reusedExistingCheckout: event.reusedExistingCheckout,
            });
            await invalidateProjectQueries(queryClient);
          }
        }
      } catch (cause) {
        if (!cancelled) setError(getErrorMessage(cause));
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, queryClient, url]);

  const isSettled = outcome !== null || error !== null;
  const percent = outcome === null ? (progress?.percent ?? 0) : 100;

  return (
    <Dialog
      open={is.nonEmptyString(url)}
      onOpenChange={(open) => {
        // A clone in flight owns a git process; let it finish before closing.
        if (!open && isSettled) onClose();
      }}
    >
      <DialogContent className="gap-4 rounded-2xl" showCloseButton={isSettled}>
        <DialogHeader>
          <DialogTitle>{t(titleKey(error, outcome))}</DialogTitle>
          <DialogDescription className="break-all">
            {is.nonEmptyString(progress?.targetPath)
              ? t("projectImport.cloneTo", { path: progress.targetPath })
              : (url ?? "")}
          </DialogDescription>
        </DialogHeader>

        {error === null ? (
          <div className="flex flex-col gap-3">
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={percent}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-1"
              role="progressbar"
            >
              <div
                className="
                  h-full rounded-full bg-primary transition-[width] duration-300
                  ease-standard
                  motion-reduce:transition-none
                "
                style={{ width: `${percent}%` }}
              />
            </div>
            <ol className="flex flex-col gap-1.5">
              {STAGE_WEIGHTS.map(({ stage }) => (
                <StageRow
                  active={progress?.stage === stage && outcome === null}
                  detail={progress?.stage === stage ? progress.detail : null}
                  done={
                    outcome !== null ||
                    isStageDone(stage, progress?.stage ?? "preparing")
                  }
                  key={stage}
                  label={t(STAGE_LABEL_KEYS[stage])}
                />
              ))}
            </ol>
            {outcome?.reusedExistingCheckout === true ? (
              <p className="text-xs text-muted-foreground">
                {t("projectImport.reusedExisting")}
              </p>
            ) : null}
          </div>
        ) : (
          <p
            className="
              flex items-start gap-2 text-sm break-all text-destructive
            "
          >
            <WarningCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {isSettled ? (
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              {t("common.close")}
            </Button>
            {outcome !== null ? (
              <Button
                onClick={() => onOpenProject(outcome.project)}
                type="button"
              >
                {t("projectImport.openProject")}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StageRow({
  active,
  detail,
  done,
  label,
}: {
  active: boolean;
  detail: string | null;
  done: boolean;
  label: string;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 text-sm",
        active || done ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {done ? (
        <CheckCircle
          className="size-4 shrink-0 text-status-success"
          weight="fill"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            active ? "animate-pulse bg-primary" : "bg-border",
          )}
        />
      )}
      <span>{label}</span>
      {is.nonEmptyString(detail) ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </li>
  );
}

/** The heading tracks the run: in flight, finished, or failed. */
function titleKey(error: string | null, outcome: CloneOutcome | null): string {
  if (error !== null) return "projectImport.failedTitle";
  if (outcome !== null) return "projectImport.readyTitle";
  return "projectImport.progressTitle";
}

function overallPercent(
  stage: ProjectCloneStage,
  stagePercent: number | null,
): number {
  if (stage === "completed") return 100;
  const weight = STAGE_WEIGHTS.find((entry) => entry.stage === stage);
  if (weight === undefined) return 0;
  return Math.round(
    weight.start + (weight.share * Math.min(stagePercent ?? 0, 100)) / 100,
  );
}

function isStageDone(
  stage: Exclude<ProjectCloneStage, "completed">,
  current: ProjectCloneStage,
): boolean {
  const stageIndex = STAGE_WEIGHTS.findIndex((entry) => entry.stage === stage);
  const currentIndex = STAGE_WEIGHTS.findIndex(
    (entry) => entry.stage === current,
  );
  return currentIndex === -1 || currentIndex > stageIndex;
}
