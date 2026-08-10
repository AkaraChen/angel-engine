import type { Project } from "@angel-engine/daemon-api/projects";
import type { FC, FormEvent, KeyboardEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import type {
  Automation,
  AutomationRun,
  AutomationRunStatus,
  AutomationStatus,
  SchedulePreset,
} from "@/features/schedule/schedule-model";

import {
  ArrowLeft,
  CalendarDots,
  ClockCountdown,
  Pause,
  Play,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
  hasMissedRun,
  nextRunPreview,
  PRESET_CRON,
  sortedRuns,
  validateCron,
} from "@/features/schedule/schedule-model";
import { formatDateTime, formatRelativeTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

const STATUS_TONE: Record<AutomationStatus, string> = {
  active: "bg-status-success",
  failing: "bg-status-danger",
  paused: "bg-muted-foreground",
  running: "animate-pulse bg-status-success",
};

const STATUS_LABEL_KEY: Record<AutomationStatus, string> = {
  active: "schedule.status.active",
  failing: "schedule.status.failing",
  paused: "schedule.status.paused",
  running: "schedule.status.running",
};

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

export const SchedulePage: FC<SchedulePageProps> = ({ projects }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const listQuery = useQuery(automationListQueryOptions());
  const automations = listQuery.data ?? [];
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedAutomation =
    automations.find(({ id }) => id === selectedAutomationId) ?? automations[0];
  const selectedId = selectedAutomation?.id;
  const showRecipes = listQuery.isSuccess && automations.length === 0;

  const runNowMutation = useMutation(
    runAutomationNowMutationOptions({ queryClient }),
  );
  const setEnabledMutation = useMutation(
    setAutomationEnabledMutationOptions({ queryClient }),
  );
  const deleteMutation = useMutation(
    deleteAutomationMutationOptions({ queryClient }),
  );

  const openAutomation = (id: string) => {
    setSelectedAutomationId(id);
    setMobileDetailOpen(true);
  };

  const moveSelection = (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => {
    event.preventDefault();
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-automation-row]",
      ) ?? [],
    );
    const currentIndex = buttons.indexOf(event.currentTarget);
    const nextButton = buttons.at(
      (currentIndex + direction + buttons.length) % buttons.length,
    );
    nextButton?.focus();
    const id = nextButton?.dataset.automationRow;
    if (id) setSelectedAutomationId(id);
  };

  const deleteSelected = () => {
    if (!selectedAutomation) return;
    if (
      !window.confirm(
        t("schedule.deleteConfirm", { name: selectedAutomation.name }),
      )
    ) {
      return;
    }
    deleteMutation.mutate(selectedAutomation.id);
    setSelectedAutomationId(undefined);
    setMobileDetailOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-3">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            {t("schedule.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("schedule.subtitle")}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus weight="bold" />
          {t("schedule.newAutomation")}
        </Button>
      </div>

      {hasMissedRun(automations) ? (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-status-info-border bg-status-info-soft px-3 py-2 text-xs">
          <ClockCountdown
            className="mt-0.5 size-4 shrink-0 text-status-info"
            weight="duotone"
          />
          <span>{t("schedule.sleepNotice")}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {listQuery.isPending || listQuery.isError || automations.length > 0 ? (
          <div
            className={cn(
              "min-h-0 w-full shrink-0 overflow-y-auto border-border-subtle bg-sidebar md:block md:w-72 md:border-r",
              mobileDetailOpen ? "hidden" : "block",
            )}
            ref={listRef}
          >
            {listQuery.isPending ? (
              <ScheduleSkeleton />
            ) : listQuery.isError ? (
              <ScheduleNotice text={t("schedule.disconnected")} />
            ) : (
              <div className="space-y-1 p-2">
                {automations.map((automation) => (
                  <AutomationRow
                    automation={automation}
                    key={automation.id}
                    onKeyDown={moveSelection}
                    onOpen={openAutomation}
                    selected={automation.id === selectedId}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background md:flex",
            mobileDetailOpen || showRecipes ? "flex" : "hidden",
          )}
        >
          {selectedAutomation ? (
            <AutomationDetail
              automation={selectedAutomation}
              deletePending={deleteMutation.isPending}
              onBack={() => setMobileDetailOpen(false)}
              onDelete={deleteSelected}
              onRunNow={() => runNowMutation.mutate(selectedAutomation.id)}
              onSetEnabled={(enabled) =>
                setEnabledMutation.mutate({
                  enabled,
                  id: selectedAutomation.id,
                })
              }
              runNowPending={runNowMutation.isPending}
              setEnabledPending={setEnabledMutation.isPending}
            />
          ) : showRecipes ? (
            <ScheduleRecipes onCreate={() => setCreateOpen(true)} />
          ) : (
            <div className="m-auto max-w-sm px-6 text-center">
              <CalendarDots
                className="mx-auto mb-3 size-8 text-muted-foreground"
                weight="duotone"
              />
              <p className="font-medium">{t("schedule.emptyDetail")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("schedule.emptyDetailDescription")}
              </p>
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

function AutomationRow({
  automation,
  onKeyDown,
  onOpen,
  selected,
}: {
  automation: Automation;
  onKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => void;
  onOpen: (id: string) => void;
  selected: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      className={cn(
        "w-full rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-overlay-active" : "hover:bg-overlay-hover",
        automation.status === "paused" && "opacity-60",
      )}
      data-automation-row={automation.id}
      onClick={() => onOpen(automation.id)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") onKeyDown(event, 1);
        if (event.key === "ArrowUp") onKeyDown(event, -1);
        if (event.key === "Enter") onOpen(automation.id);
      }}
      tabIndex={selected ? 0 : -1}
      type="button"
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            STATUS_TONE[automation.status],
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{automation.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {automation.nextRunAt
                ? formatRelativeTime(automation.nextRunAt)
                : t("schedule.paused")}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {automation.scheduleLabel}
            {automation.projectName ? ` · ${automation.projectName}` : ""}
          </p>
          <p className="mt-1 text-xs font-medium">
            {t(STATUS_LABEL_KEY[automation.status])}
          </p>
        </div>
      </div>
    </button>
  );
}

function AutomationDetail({
  automation,
  deletePending,
  onBack,
  onDelete,
  onRunNow,
  onSetEnabled,
  runNowPending,
  setEnabledPending,
}: {
  automation: Automation;
  deletePending: boolean;
  onBack: () => void;
  onDelete: () => void;
  onRunNow: () => void;
  onSetEnabled: (enabled: boolean) => void;
  runNowPending: boolean;
  setEnabledPending: boolean;
}) {
  const { t } = useTranslation();
  const runs = sortedRuns(automation.runs);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-5 py-4">
        <Button
          className="md:hidden"
          size="icon-sm"
          variant="ghost"
          onClick={onBack}
        >
          <ArrowLeft />
          <span className="sr-only">{t("schedule.backToList")}</span>
        </Button>
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-base font-semibold">
              {automation.name}
            </h2>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  STATUS_TONE[automation.status],
                )}
              />
              {t(STATUS_LABEL_KEY[automation.status])}
            </span>
          </div>
        </div>
        <Button
          disabled={runNowPending || automation.status === "running"}
          size="sm"
          variant="outline"
          onClick={onRunNow}
        >
          <Play weight="fill" />
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
          {automation.enabled ? (
            <Pause weight="fill" />
          ) : (
            <Play weight="fill" />
          )}
          {automation.enabled ? t("schedule.pause") : t("schedule.resume")}
        </Button>
        <Button
          aria-label={t("common.delete")}
          disabled={deletePending}
          size="icon-sm"
          variant="destructive"
          onClick={onDelete}
        >
          <Trash />
        </Button>
      </div>

      <div className="space-y-6 p-5">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryItem
            label={t("schedule.schedule")}
            value={`${automation.scheduleLabel}\n${automation.cron}`}
          />
          <SummaryItem
            label={t("schedule.nextRun")}
            value={
              automation.nextRunAt
                ? formatDateTime(automation.nextRunAt)
                : t("schedule.paused")
            }
          />
          <SummaryItem
            label={t("schedule.agent")}
            value={automation.agentLabel}
          />
          <SummaryItem
            label={t("schedule.project")}
            value={automation.projectName ?? t("schedule.noProject")}
          />
          <SummaryItem
            label={t("schedule.lastResult")}
            value={
              runs[0]
                ? t(RUN_LABEL_KEY[runs[0].status])
                : t("schedule.neverRun")
            }
          />
        </dl>

        <section>
          <h3 className="mb-2 font-display text-sm font-semibold">
            {t("schedule.runHistory")}
          </h3>
          {runs.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-surface-1 px-4 py-8 text-center text-sm text-muted-foreground">
              {t("schedule.noRuns")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)] gap-3 border-b border-border-subtle px-4 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1.4fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)_minmax(5rem,0.5fr)]">
                <span>{t("schedule.started")}</span>
                <span>{t("schedule.result")}</span>
                <span>{t("schedule.trigger")}</span>
                <span className="hidden sm:block">
                  {t("schedule.duration")}
                </span>
              </div>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm font-medium">{value}</dd>
    </div>
  );
}

function RunRow({ run }: { run: AutomationRun }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)] gap-3 border-b border-border-subtle px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)_minmax(5rem,0.5fr)]">
      <span className="truncate">{formatDateTime(run.startedAt)}</span>
      <span
        className={cn(
          "min-w-0",
          run.status === "failed" && "text-status-danger",
          run.status === "missed" && "text-status-attention",
        )}
      >
        <span>{t(RUN_LABEL_KEY[run.status])}</span>
        {run.error ? (
          <span className="block truncate text-xs">{run.error}</span>
        ) : null}
      </span>
      <span className="text-muted-foreground">
        {t(`schedule.triggerType.${run.trigger}`)}
      </span>
      <span className="hidden text-muted-foreground sm:block">
        {run.durationSeconds === undefined
          ? "—"
          : t("schedule.seconds", { count: run.durationSeconds })}
      </span>
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
    if (!nextOpen && isDirty && !window.confirm(t("schedule.discardConfirm")))
      return;
    if (!nextOpen) dispatch({ type: "reset" });
    onOpenChange(nextOpen);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    createMutation.mutate(
      {
        agentLabel: t("schedule.currentAgent"),
        cron: state.cron,
        name: state.name.trim(),
        notifyOnFailure: state.notifyOnFailure,
        projectId: project?.id,
        projectName:
          project === undefined
            ? undefined
            : getProjectDisplayName(project.path),
        prompt: state.prompt.trim(),
        scheduleLabel: presetLabel(t, state.preset),
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
