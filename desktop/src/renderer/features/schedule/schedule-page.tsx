import type { Project } from "@angel-engine/daemon-api/projects";
import type { FC, FormEvent, KeyboardEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import type {
  Automation,
  AutomationRun,
  AutomationRunStatus,
  AutomationTemplate,
  CreateAutomationFormState,
  SchedulePreset,
} from "@/features/schedule/schedule-model";

import {
  CalendarDots,
  CaretDown,
  CaretRight,
  Check,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  cronForNaturalSchedule,
  createAutomationFormInitialState,
  nextRunPreview,
  PRESET_CRON,
  presetForCron,
  sortedRuns,
  validateCron,
} from "@/features/schedule/schedule-model";
import { formatDateTime, formatRelativeTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

const NO_PROJECT_SELECT_VALUE = "__no_project__";
const WIZARD_STEPS = ["what", "when", "parameters", "confirm"] as const;
type RecipeKey = "ciHeartbeat" | "dependencyAudit" | "nightlyTests";
type WizardSource = RecipeKey | "blank";

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
  const [createSource, setCreateSource] = useState<WizardSource>();
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
      <div className="flex items-center justify-end gap-4 px-6 py-4">
        <Button
          size="sm"
          onClick={() => {
            setCreateSource(undefined);
            setCreateOpen(true);
          }}
        >
          <Plus weight="bold" />
          {t("schedule.newAutomation")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" ref={listRef}>
        <div
          className={cn(
            "mx-auto w-full",
            listQuery.isError
              ? "flex min-h-full max-w-none"
              : "max-w-2xl px-6 pb-6",
          )}
        >
          {listQuery.isPending ? (
            <ScheduleSkeleton />
          ) : listQuery.isError ? (
            <ScheduleNotice text={t("schedule.disconnected")} />
          ) : automations.length === 0 ? (
            <ScheduleRecipes
              onCreate={(source) => {
                setCreateSource(source);
                setCreateOpen(true);
              }}
            />
          ) : (
            <div className="space-y-1.5">
              {broken.map(renderCard)}
              {rest.map(renderCard)}
            </div>
          )}
        </div>
      </div>

      <CreateAutomationDialog
        automations={automations}
        onOpenChange={setCreateOpen}
        open={createOpen}
        projects={projects}
        source={createSource}
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

type CreateFormState = CreateAutomationFormState;

type CreateFormAction =
  | {
      field: keyof CreateFormState;
      type: "field";
      value: boolean | string;
    }
  | { preset: SchedulePreset; type: "preset" }
  | { state: CreateFormState; type: "initialize" }
  | { type: "reset" };

function createFormReducer(
  state: CreateFormState,
  action: CreateFormAction,
): CreateFormState {
  if (action.type === "initialize") return action.state;
  if (action.type === "reset") return createAutomationFormInitialState();
  if (action.type === "preset") {
    return {
      ...state,
      cron: cronForNaturalSchedule(
        action.preset,
        state.time,
        state.weekday,
        state.cron,
      ),
      preset: action.preset,
    };
  }

  const next = { ...state, [action.field]: action.value };
  if (action.field === "time" || action.field === "weekday") {
    next.cron = cronForNaturalSchedule(
      next.preset,
      next.time,
      next.weekday,
      next.cron,
    );
  }
  return next;
}

function CreateAutomationDialog({
  automations,
  onOpenChange,
  open,
  projects,
  source,
}: {
  automations: Automation[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projects: Project[];
  source?: WizardSource;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    createFormReducer,
    undefined,
    createAutomationFormInitialState,
  );
  const [selection, setSelection] = useState<WizardSource>();
  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const createMutation = useMutation(
    createAutomationMutationOptions({ queryClient }),
  );
  const project = projects.find(({ id }) => id === state.projectId);
  const cronValid = validateCron(state.cron);
  const preview = nextRunPreview(state.preset, new Date(), state.cron);
  const nameValid = state.name.trim().length > 0;
  const promptValid = state.prompt.trim().length > 0;
  const stepValid =
    step === 1
      ? selection !== undefined
      : step === 2
        ? cronValid && preview[0] !== undefined
        : step === 3
          ? nameValid && promptValid
          : true;
  const isDirty =
    selection !== undefined ||
    state.name.length > 0 ||
    state.prompt.length > 0 ||
    state.projectId.length > 0;

  useEffect(() => {
    if (!open) return;
    const template =
      source === undefined || source === "blank"
        ? undefined
        : automationTemplateForRecipe(t, source);
    dispatch({
      state: createAutomationFormInitialState(
        template,
        automations.map(({ name }) => name),
      ),
      type: "initialize",
    });
    setSelection(source);
    setStep(1);
    setFurthestStep(1);
  }, [automations, open, source, t]);

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
        setSelection(undefined);
        onOpenChange(false);
      });
      return;
    }
    if (!nextOpen) dispatch({ type: "reset" });
    onOpenChange(nextOpen);
  };

  const chooseSource = (nextSource: WizardSource) => {
    const template =
      nextSource === "blank"
        ? undefined
        : automationTemplateForRecipe(t, nextSource);
    setSelection(nextSource);
    dispatch({
      state: createAutomationFormInitialState(
        template,
        automations.map(({ name }) => name),
      ),
      type: "initialize",
    });
  };

  const advance = () => {
    if (!stepValid || step >= WIZARD_STEPS.length) return;
    const nextStep = step + 1;
    setStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < WIZARD_STEPS.length) {
      advance();
      return;
    }
    if (!nameValid || !promptValid || !cronValid) return;
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
          setSelection(undefined);
          onOpenChange(false);
        },
      },
    );
  };

  const nextRun = preview[0]
    ? formatDateTime(preview[0].toISOString())
    : undefined;

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("schedule.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("schedule.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <WizardProgress
          current={step}
          furthest={furthestStep}
          onStepChange={setStep}
        />

        <form className="space-y-5" onSubmit={submit}>
          {step === 1 ? (
            <WhatStep onChoose={chooseSource} selected={selection} />
          ) : null}
          {step === 2 ? (
            <WhenStep
              cronValid={cronValid}
              dispatch={dispatch}
              nextRun={nextRun}
              state={state}
            />
          ) : null}
          {step === 3 ? (
            <ParametersStep
              dispatch={dispatch}
              nameValid={nameValid}
              projects={projects}
              promptValid={promptValid}
              state={state}
              templateSelected={selection !== "blank"}
            />
          ) : null}
          {step === 4 ? (
            <ConfirmStep
              nextRun={nextRun}
              onEdit={setStep}
              project={project}
              state={state}
            />
          ) : null}

          <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => requestOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <div className="ml-auto flex min-w-0 gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep((current) => current - 1)}
                >
                  {t("schedule.wizard.back")}
                </Button>
              ) : null}
              <Button
                disabled={!stepValid || createMutation.isPending}
                type="submit"
              >
                {step === WIZARD_STEPS.length
                  ? t("schedule.createAction")
                  : t("schedule.wizard.next")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WizardProgress({
  current,
  furthest,
  onStepChange,
}: {
  current: number;
  furthest: number;
  onStepChange: (step: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm font-medium sm:hidden">
        {t("schedule.wizard.stepCount", {
          current,
          total: WIZARD_STEPS.length,
        })}
      </p>
      <ol className="hidden items-center sm:flex">
        {WIZARD_STEPS.map((stepName, index) => {
          const stepNumber = index + 1;
          const complete = stepNumber < current || stepNumber < furthest;
          const active = stepNumber === current;
          return (
            <li className="flex min-w-0 flex-1 items-center" key={stepName}>
              <button
                className={cn(
                  "flex min-w-0 items-center gap-2 text-left text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                  complete && "hover:text-foreground",
                )}
                disabled={!complete}
                onClick={() => onStepChange(stepNumber)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    active &&
                      "border-primary bg-primary-soft text-primary-strong",
                    complete &&
                      "border-primary-strong bg-primary-strong text-primary-foreground",
                  )}
                >
                  {complete ? <Check weight="bold" /> : stepNumber}
                </span>
                <span className="truncate">
                  {t("schedule.wizard.steps." + stepName)}
                </span>
              </button>
              {stepNumber < WIZARD_STEPS.length ? (
                <span className="mx-3 h-px flex-1 bg-border-subtle" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function WhatStep({
  onChoose,
  selected,
}: {
  onChoose: (source: WizardSource) => void;
  selected?: WizardSource;
}) {
  const { t } = useTranslation();
  const recipes: RecipeKey[] = [
    "dependencyAudit",
    "ciHeartbeat",
    "nightlyTests",
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {recipes.map((recipe) => (
          <ChoiceCard
            description={t("schedule.recipes." + recipe + "Description")}
            key={recipe}
            label={t("schedule.recipes." + recipe)}
            onClick={() => onChoose(recipe)}
            selected={selected === recipe}
          />
        ))}
        <ChoiceCard
          description={t("schedule.wizard.blankDescription")}
          label={t("schedule.wizard.blankName")}
          onClick={() => onChoose("blank")}
          selected={selected === "blank"}
        />
      </div>
      {selected === undefined ? (
        <p className="text-xs text-status-danger">
          {t("schedule.wizard.chooseRequired")}
        </p>
      ) : null}
    </div>
  );
}

function ChoiceCard({
  description,
  label,
  onClick,
  selected,
}: {
  description: string;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "rounded-lg border bg-card p-4 text-left transition-colors hover:bg-overlay-hover",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center justify-between gap-3 text-sm font-medium">
        {label}
        {selected ? (
          <Check className="size-4 text-primary-strong" weight="bold" />
        ) : null}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

function WhenStep({
  cronValid,
  dispatch,
  nextRun,
  state,
}: {
  cronValid: boolean;
  dispatch: (action: CreateFormAction) => void;
  nextRun?: string;
  state: CreateFormState;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Field label={t("schedule.schedule")}>
        <Select
          value={state.preset}
          onValueChange={(value) =>
            dispatch({ preset: value as SchedulePreset, type: "preset" })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
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
              <SelectItem key={preset} value={preset}>
                {preset === "daily"
                  ? t("schedule.wizard.dailyAt", { time: state.time })
                  : preset === "weekly"
                    ? t("schedule.wizard.weeklyAt", {
                        time: state.time,
                        weekday: t(
                          "schedule.wizard.weekdays." +
                            weekdayKeyForValue(state.weekday),
                        ),
                      })
                    : presetLabel(t, preset)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {state.preset === "daily" || state.preset === "weekly" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {state.preset === "weekly" ? (
            <Field label={t("schedule.schedulePresets.weekly")}>
              <Select
                value={state.weekday}
                onValueChange={(value) =>
                  dispatch({ field: "weekday", type: "field", value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    ["1", "monday"],
                    ["2", "tuesday"],
                    ["3", "wednesday"],
                    ["4", "thursday"],
                    ["5", "friday"],
                    ["6", "saturday"],
                    ["0", "sunday"],
                  ].map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {t("schedule.wizard.weekdays." + label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label={t("schedule.schedule")}>
            <Input
              type="time"
              value={state.time}
              onChange={(event) =>
                dispatch({
                  field: "time",
                  type: "field",
                  value: event.currentTarget.value,
                })
              }
            />
          </Field>
        </div>
      ) : null}
      {state.preset === "custom" ? (
        <Field label={t("schedule.customCron")}>
          <Input
            aria-describedby="cron-error"
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
          {!cronValid ? (
            <span className="text-xs text-status-danger" id="cron-error">
              {t("schedule.invalidCron")}
            </span>
          ) : null}
        </Field>
      ) : null}
      {cronValid && nextRun ? (
        <div className="rounded-md bg-surface-2 px-3 py-3 text-sm">
          <span className="font-medium">
            {t("schedule.wizard.nextRun", { time: nextRun })}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ParametersStep({
  dispatch,
  nameValid,
  projects,
  promptValid,
  state,
  templateSelected,
}: {
  dispatch: (action: CreateFormAction) => void;
  nameValid: boolean;
  projects: Project[];
  promptValid: boolean;
  state: CreateFormState;
  templateSelected: boolean;
}) {
  const { t } = useTranslation();
  const fields = (
    <ParameterFields
      dispatch={dispatch}
      nameValid={nameValid}
      projects={projects}
      promptValid={promptValid}
      state={state}
    />
  );
  if (!templateSelected) return <div className="space-y-4">{fields}</div>;

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-surface-2 px-3 py-3 text-sm text-muted-foreground">
        {t("schedule.wizard.noExtraParameters")}
      </p>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            className="w-full justify-between"
            type="button"
            variant="outline"
          >
            {t("schedule.wizard.advancedSettings")}
            <CaretDown className="transition-transform group-data-[state=open]/button:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          {fields}
        </CollapsibleContent>
      </Collapsible>
      {!nameValid ? (
        <p className="text-xs text-status-danger">
          {t("schedule.wizard.requiredName")}
        </p>
      ) : null}
      {!promptValid ? (
        <p className="text-xs text-status-danger">
          {t("schedule.wizard.requiredPrompt")}
        </p>
      ) : null}
    </div>
  );
}

function ParameterFields({
  dispatch,
  nameValid,
  projects,
  promptValid,
  state,
}: {
  dispatch: (action: CreateFormAction) => void;
  nameValid: boolean;
  projects: Project[];
  promptValid: boolean;
  state: CreateFormState;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t("schedule.name")}>
        <Input
          aria-describedby="name-error"
          aria-invalid={!nameValid}
          value={state.name}
          onChange={(event) =>
            dispatch({
              field: "name",
              type: "field",
              value: event.currentTarget.value,
            })
          }
        />
        {!nameValid ? (
          <span className="text-xs text-status-danger" id="name-error">
            {t("schedule.wizard.requiredName")}
          </span>
        ) : null}
      </Field>
      <Field label={t("schedule.prompt")}>
        <Textarea
          aria-describedby="prompt-error"
          aria-invalid={!promptValid}
          className="min-h-28"
          value={state.prompt}
          onChange={(event) =>
            dispatch({
              field: "prompt",
              type: "field",
              value: event.currentTarget.value,
            })
          }
        />
        {!promptValid ? (
          <span className="text-xs text-status-danger" id="prompt-error">
            {t("schedule.wizard.requiredPrompt")}
          </span>
        ) : null}
      </Field>
      <Field label={t("schedule.project")}>
        <Select
          value={state.projectId || NO_PROJECT_SELECT_VALUE}
          onValueChange={(value) =>
            dispatch({
              field: "projectId",
              type: "field",
              value: value === NO_PROJECT_SELECT_VALUE ? "" : value,
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PROJECT_SELECT_VALUE}>
              {t("schedule.noProject")}
            </SelectItem>
            {projects.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {getProjectDisplayName(item.path)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
    </>
  );
}

function ConfirmStep({
  nextRun,
  onEdit,
  project,
  state,
}: {
  nextRun?: string;
  onEdit: (step: number) => void;
  project?: Project;
  state: CreateFormState;
}) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-border-subtle rounded-lg border border-border">
      <SummaryRow
        label={t("schedule.wizard.steps.what")}
        onEdit={() => onEdit(1)}
      >
        <p className="font-medium">{state.name}</p>
        <p className="mt-1 text-muted-foreground">{state.prompt}</p>
      </SummaryRow>
      <SummaryRow
        label={t("schedule.wizard.steps.when")}
        onEdit={() => onEdit(2)}
      >
        <p>{summaryScheduleLabel(t, state)}</p>
      </SummaryRow>
      <SummaryRow
        label={t("schedule.wizard.nextRun", { time: "" }).replace(
          /[:：]\s*$/,
          "",
        )}
        onEdit={() => onEdit(2)}
      >
        <p>{nextRun}</p>
      </SummaryRow>
      <SummaryRow
        label={t("schedule.wizard.steps.parameters")}
        onEdit={() => onEdit(3)}
      >
        <p>
          {project
            ? getProjectDisplayName(project.path)
            : t("schedule.noProject")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t("schedule.notifyOnFailure")}:{" "}
          {state.notifyOnFailure ? t("common.allow") : t("common.deny")}
        </p>
      </SummaryRow>
    </div>
  );
}

function SummaryRow({
  children,
  label,
  onEdit,
}: {
  children: ReactNode;
  label: string;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-4 p-4">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <div className="text-sm">{children}</div>
      </div>
      <Button size="xs" type="button" variant="ghost" onClick={onEdit}>
        {t("schedule.wizard.edit")}
      </Button>
    </div>
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

function automationTemplateForRecipe(
  t: TFunction,
  recipe: RecipeKey,
): AutomationTemplate {
  const cron =
    recipe === "ciHeartbeat"
      ? PRESET_CRON["every-30-minutes"]
      : recipe === "nightlyTests"
        ? "0 2 * * *"
        : PRESET_CRON.daily;
  return {
    cron,
    name: t("schedule.recipes." + recipe),
    notifyOnFailure: true,
    prompt: t("schedule.recipes." + recipe + "Description"),
  };
}

function ScheduleRecipes({
  onCreate,
}: {
  onCreate: (source: WizardSource) => void;
}) {
  const { t } = useTranslation();
  const recipes: RecipeKey[] = [
    "dependencyAudit",
    "ciHeartbeat",
    "nightlyTests",
  ];
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
        {recipes.map((recipe) => (
          <button
            className="rounded-lg border border-border bg-card p-4 text-left hover:bg-overlay-hover"
            key={recipe}
            onClick={() => onCreate(recipe)}
            type="button"
          >
            <span className="block text-sm font-medium">
              {t("schedule.recipes." + recipe)}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("schedule.recipes." + recipe + "Description")}
            </span>
          </button>
        ))}
      </div>
      <Button
        className="mx-auto mt-3 flex"
        variant="ghost"
        onClick={() => onCreate("blank")}
      >
        {t("schedule.startFromScratch")}
      </Button>
    </div>
  );
}

function summaryScheduleLabel(t: TFunction, state: CreateFormState): string {
  if (state.preset === "daily") {
    return t("schedule.wizard.dailyAt", { time: state.time });
  }
  if (state.preset === "weekly") {
    return t("schedule.wizard.weeklyAt", {
      time: state.time,
      weekday: t(
        "schedule.wizard.weekdays." + weekdayKeyForValue(state.weekday),
      ),
    });
  }
  return presetLabel(t, state.preset);
}

function weekdayKeyForValue(value: string): string {
  return (
    [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][Number(value)] ?? "monday"
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
    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
      <WarningCircle className="size-4 shrink-0" />
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
