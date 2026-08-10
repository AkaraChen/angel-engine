import type { Project } from "@angel-engine/daemon-api/projects";
import type { FC, FormEvent, KeyboardEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import type {
  Automation,
  AutomationRun,
  AutomationRunStatus,
  SchedulePreset,
} from "@/features/schedule/schedule-model";

import {
  CalendarDots,
  CaretRight,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  automationListQueryOptions,
  createAutomationMutationOptions,
  deleteAutomationMutationOptions,
  runAutomationNowMutationOptions,
  setAutomationEnabledMutationOptions,
} from "@/features/schedule/requests/automations";
import {
  nextRunPreview,
  PRESET_CRON,
  presetForCron,
  sortedRuns,
  validateCron,
} from "@/features/schedule/schedule-model";
import { formatDateTime, formatRelativeTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

/** Older runs stop informing the decision to keep or fix an automation. */
const RUN_HISTORY_LIMIT = 5;

const RUN_LABEL_KEY: Record<AutomationRunStatus, string> = {
  cancelled: "schedule.runStatus.cancelled",
  failed: "schedule.runStatus.failed",
  missed: "schedule.runStatus.missed",
  running: "schedule.runStatus.running",
  succeeded: "schedule.runStatus.succeeded",
};

interface SchedulePageProps {
  projects: Project[];
}

/**
 * One column of automations, each expandable in place.
 *
 * The screen is deliberately spare. An automation page is not a record viewer:
 * between visits the only things that changed are "when does this run next" and
 * "did anything break", so those are the only two facts a collapsed row spends
 * pixels on. Configuration the user typed in themselves stays in the create
 * flow; the expanded row is for actions and changing run history.
 */
export const SchedulePage: FC<SchedulePageProps> = ({ projects }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const listQuery = useQuery(automationListQueryOptions());
  const automations = listQuery.data ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string>();
  const listRef = useRef<HTMLDivElement>(null);

  const runNowMutation = useMutation(
    runAutomationNowMutationOptions({ queryClient }),
  );
  const setEnabledMutation = useMutation(
    setAutomationEnabledMutationOptions({ queryClient }),
  );
  const deleteMutation = useMutation(
    deleteAutomationMutationOptions({ queryClient }),
  );

  const broken = automations.filter(
    (automation) => automation.status === "failing",
  );
  const rest = automations
    .filter((automation) => automation.status !== "failing")
    .sort(byNextRun);

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => {
    event.preventDefault();
    const headers = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-automation-card]",
      ) ?? [],
    );
    const currentIndex = headers.indexOf(event.currentTarget);
    headers
      .at((currentIndex + direction + headers.length) % headers.length)
      ?.focus();
  };

  const requestDelete = (automation: Automation) => {
    void confirmAction({
      cancelLabel: t("common.cancel"),
      confirmLabel: t("common.delete"),
      title: t("schedule.deleteConfirm", { name: automation.name }),
      tone: "danger",
    }).then((confirmed) => {
      if (!confirmed) return;
      deleteMutation.mutate(automation.id);
      setExpandedId(undefined);
    });
  };

  const renderCard = (automation: Automation) => (
    <AutomationCard
      automation={automation}
      expanded={automation.id === expandedId}
      key={automation.id}
      onDelete={() => requestDelete(automation)}
      onKeyDown={moveFocus}
      onRunNow={() => runNowMutation.mutate(automation.id)}
      onSetEnabled={(enabled) =>
        setEnabledMutation.mutate({ enabled, id: automation.id })
      }
      onToggle={() =>
        setExpandedId((current) =>
          current === automation.id ? undefined : automation.id,
        )
      }
      runNowPending={runNowMutation.isPending}
      setEnabledPending={setEnabledMutation.isPending}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <h1 className="font-display text-lg font-semibold tracking-tight">
          {t("schedule.title")}
        </h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus weight="bold" />
          {t("schedule.newAutomation")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" ref={listRef}>
        <div className="mx-auto w-full max-w-2xl px-6 pb-6">
          {listQuery.isPending ? (
            <ScheduleSkeleton />
          ) : listQuery.isError ? (
            <ScheduleNotice text={t("schedule.disconnected")} />
          ) : automations.length === 0 ? (
            <ScheduleRecipes onCreate={() => setCreateOpen(true)} />
          ) : (
            <div className="space-y-1.5">
              {broken.map(renderCard)}
              {rest.map(renderCard)}
            </div>
          )}
        </div>
      </div>

      <CreateAutomationDialog
        onOpenChange={setCreateOpen}
        open={createOpen}
        projects={projects}
      />
    </div>
  );
};

/** Paused automations have no next run, and sort last rather than first. */
function byNextRun(left: Automation, right: Automation): number {
  const leftAt = left.nextRunAt ?? "";
  const rightAt = right.nextRunAt ?? "";
  if (leftAt === "") return rightAt === "" ? 0 : 1;
  if (rightAt === "") return -1;
  return leftAt.localeCompare(rightAt);
}

function AutomationCard({
  automation,
  expanded,
  onDelete,
  onKeyDown,
  onRunNow,
  onSetEnabled,
  onToggle,
  runNowPending,
  setEnabledPending,
}: {
  automation: Automation;
  expanded: boolean;
  onDelete: () => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => void;
  onRunNow: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onToggle: () => void;
  runNowPending: boolean;
  setEnabledPending: boolean;
}) {
  const { t } = useTranslation();
  const runs = sortedRuns(automation.runs);
  const panelId = `automation-panel-${automation.id}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        expanded ? "border-border" : "border-border-subtle",
      )}
    >
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-overlay-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-automation-card={automation.id}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") onKeyDown(event, 1);
          if (event.key === "ArrowUp") onKeyDown(event, -1);
        }}
        type="button"
      >
        <CaretRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
          weight="bold"
        />
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-medium",
              !automation.enabled && "text-muted-foreground",
            )}
          >
            {automation.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {scheduleLabel(t, automation.cron)}
          </span>
        </div>
        {/* Only a broken automation gets a word. "Active" is the absence of
            news, and the next-run time already implies it. */}
        {automation.status === "failing" ? (
          <span className="shrink-0 text-xs text-status-danger">
            {t("schedule.status.failing")}
          </span>
        ) : null}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {automation.nextRunAt
            ? formatRelativeTime(automation.nextRunAt)
            : t("schedule.paused")}
        </span>
      </button>

      {expanded ? (
        <div
          className="border-t border-border-subtle pt-3 pr-4 pb-4 pl-[2.625rem]"
          id={panelId}
        >
          <p className="text-sm">{automation.prompt}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={runNowPending || automation.status === "running"}
              size="sm"
              variant="outline"
              onClick={onRunNow}
            >
              {automation.status === "running"
                ? t("schedule.alreadyRunning")
                : t("schedule.runNow")}
            </Button>
            <Button
              disabled={setEnabledPending}
              size="sm"
              variant="outline"
              onClick={() => onSetEnabled(!automation.enabled)}
            >
              {automation.enabled ? t("schedule.pause") : t("schedule.resume")}
            </Button>
            <Button
              aria-label={t("common.delete")}
              className="ml-auto"
              size="icon-sm"
              variant="ghost"
              onClick={onDelete}
            >
              <Trash className="text-status-danger" />
            </Button>
          </div>

          {runs.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {runs.slice(0, RUN_HISTORY_LIMIT).map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A run is worth one line: what happened, when, and — only when it failed —
 * why. Duration and the "Scheduled" trigger were dropped: they were printed on
 * every row and nobody changes anything because of either.
 */
function RunRow({ run }: { run: AutomationRun }) {
  const { t } = useTranslation();
  const failed = run.status === "failed";
  const missed = run.status === "missed";

  return (
    <div className="text-xs">
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            failed && "text-status-danger",
            missed && "text-status-attention",
            !failed && !missed && "text-muted-foreground",
          )}
        >
          {t(RUN_LABEL_KEY[run.status])}
        </span>
        <span className="text-muted-foreground">
          {formatRelativeTime(run.startedAt)}
        </span>
        {run.trigger === "manual" ? (
          <span className="text-muted-foreground">
            {t("schedule.triggerType.manual")}
          </span>
        ) : null}
      </span>
      {run.error ? (
        <p className="mt-0.5 text-muted-foreground">{run.error}</p>
      ) : null}
    </div>
  );
}

interface CreateFormState {
  cron: string;
  name: string;
  notifyOnFailure: boolean;
  preset: SchedulePreset;
  projectId: string;
  prompt: string;
}

type CreateFormAction =
  | {
      field: keyof CreateFormState;
      type: "field";
      value: boolean | string;
    }
  | { preset: SchedulePreset; type: "preset" }
  | { type: "reset" };

const INITIAL_CREATE_FORM: CreateFormState = {
  cron: PRESET_CRON.daily,
  name: "",
  notifyOnFailure: true,
  preset: "daily",
  projectId: "",
  prompt: "",
};

function createFormReducer(
  state: CreateFormState,
  action: CreateFormAction,
): CreateFormState {
  if (action.type === "reset") return INITIAL_CREATE_FORM;
  if (action.type === "preset") {
    return {
      ...state,
      cron:
        action.preset === "custom" ? state.cron : PRESET_CRON[action.preset],
      preset: action.preset,
    };
  }
  return { ...state, [action.field]: action.value };
}

function CreateAutomationDialog({
  onOpenChange,
  open,
  projects,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projects: Project[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(createFormReducer, INITIAL_CREATE_FORM);
  const createMutation = useMutation(
    createAutomationMutationOptions({ queryClient }),
  );
  const cronValid = state.preset !== "custom" || validateCron(state.cron);
  const canSubmit =
    state.name.trim().length > 0 && state.prompt.trim().length > 0 && cronValid;
  const project = projects.find(({ id }) => id === state.projectId);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const preview = nextRunPreview(state.preset, new Date(), state.cron);
  const isDirty =
    state.name.length > 0 ||
    state.prompt.length > 0 ||
    state.projectId.length > 0;

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      void confirmAction({
        cancelLabel: t("common.cancel"),
        confirmLabel: t("dialog.confirm.discard"),
        title: t("schedule.discardConfirm"),
        tone: "danger",
      }).then((confirmed) => {
        if (!confirmed) return;
        dispatch({ type: "reset" });
        onOpenChange(false);
      });
      return;
    }
    if (!nextOpen) dispatch({ type: "reset" });
    onOpenChange(nextOpen);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    createMutation.mutate(
      {
        cron: state.cron,
        name: state.name.trim(),
        notifyOnFailure: state.notifyOnFailure,
        projectId: project?.id,
        prompt: state.prompt.trim(),
      },
      {
        onSuccess: () => {
          dispatch({ type: "reset" });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("schedule.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("schedule.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <Field label={t("schedule.name")}>
            <Input
              autoFocus
              value={state.name}
              onChange={(event) =>
                dispatch({
                  field: "name",
                  type: "field",
                  value: event.currentTarget.value,
                })
              }
            />
          </Field>
          <Field label={t("schedule.schedule")}>
            <NativeSelect
              className="w-full"
              selectClassName="w-full"
              value={state.preset}
              onChange={(event) =>
                dispatch({
                  preset: event.currentTarget.value as SchedulePreset,
                  type: "preset",
                })
              }
            >
              {(
                [
                  "every-30-minutes",
                  "hourly",
                  "daily",
                  "weekdays",
                  "weekly",
                  "custom",
                ] as const
              ).map((preset) => (
                <NativeSelectOption key={preset} value={preset}>
                  {presetLabel(t, preset)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {state.preset === "custom" ? (
            <Field label={t("schedule.customCron")}>
              <Input
                aria-invalid={!cronValid}
                className="font-mono"
                value={state.cron}
                onChange={(event) =>
                  dispatch({
                    field: "cron",
                    type: "field",
                    value: event.currentTarget.value,
                  })
                }
              />
            </Field>
          ) : null}
          <div
            className={cn(
              "rounded-md px-3 py-2 text-xs",
              cronValid
                ? "bg-surface-2 text-muted-foreground"
                : "border border-status-danger-border bg-status-danger-soft text-status-danger",
            )}
          >
            {cronValid ? (
              <>
                <p className="mb-1 font-medium text-foreground">
                  {t("schedule.nextThreeRuns", { timezone })}
                </p>
                {preview.map((date) => (
                  <p key={date.toISOString()}>
                    {formatDateTime(date.toISOString())}
                  </p>
                ))}
              </>
            ) : (
              <p>{t("schedule.invalidCron")}</p>
            )}
          </div>
          <Field label={t("schedule.prompt")}>
            <Textarea
              className="min-h-32"
              value={state.prompt}
              onChange={(event) =>
                dispatch({
                  field: "prompt",
                  type: "field",
                  value: event.currentTarget.value,
                })
              }
            />
          </Field>
          <Field label={t("schedule.agent")}>
            <NativeSelect
              className="w-full"
              disabled
              selectClassName="w-full"
              value="current"
            >
              <NativeSelectOption value="current">
                {t("schedule.currentAgent")}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label={t("schedule.project")}>
            <NativeSelect
              className="w-full"
              selectClassName="w-full"
              value={state.projectId}
              onChange={(event) =>
                dispatch({
                  field: "projectId",
                  type: "field",
                  value: event.currentTarget.value,
                })
              }
            >
              <NativeSelectOption value="">
                {t("schedule.noProject")}
              </NativeSelectOption>
              {projects.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {getProjectDisplayName(item.path)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center justify-between gap-4 rounded-md border border-border-subtle px-3 py-2.5 text-sm">
            <span>{t("schedule.notifyOnFailure")}</span>
            <Switch
              checked={state.notifyOnFailure}
              onCheckedChange={(checked) =>
                dispatch({
                  field: "notifyOnFailure",
                  type: "field",
                  value: checked,
                })
              }
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => requestOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!canSubmit || createMutation.isPending}
              type="submit"
            >
              {t("schedule.createAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ScheduleRecipes({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="m-auto w-full max-w-3xl p-6">
      <div className="mb-5 text-center">
        <CalendarDots
          className="mx-auto mb-2 size-8 text-muted-foreground"
          weight="duotone"
        />
        <p className="font-display text-base font-semibold">
          {t("schedule.recipes.title")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["dependencyAudit", "ciHeartbeat", "nightlyTests"] as const).map(
          (recipe) => (
            <button
              className="rounded-lg border border-border bg-card p-4 text-left hover:bg-overlay-hover"
              key={recipe}
              onClick={onCreate}
              type="button"
            >
              <span className="block text-sm font-medium">
                {t(`schedule.recipes.${recipe}`)}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(`schedule.recipes.${recipe}Description`)}
              </span>
            </button>
          ),
        )}
      </div>
      <Button className="mx-auto mt-3 flex" variant="ghost" onClick={onCreate}>
        {t("schedule.startFromScratch")}
      </Button>
    </div>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton className="h-16 rounded-lg" key={index} />
      ))}
    </div>
  );
}

function ScheduleNotice({ text }: { text: string }) {
  return (
    <div className="m-3 flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-1 p-3 text-sm text-muted-foreground">
      <WarningCircle className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function presetLabel(t: TFunction, preset: SchedulePreset): string {
  return t(`schedule.schedulePresets.${preset}`);
}

function scheduleLabel(t: TFunction, cron: string): string {
  const preset = presetForCron(cron);
  return preset === undefined ? cron.trim() : presetLabel(t, preset);
}
